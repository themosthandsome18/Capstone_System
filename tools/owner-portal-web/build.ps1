<#
.SYNOPSIS
Build the public Sanitation shell with the local Flutter 3.44.0 / Dart 3.12.0 SDK.
.DESCRIPTION
Run only in a trusted local Windows session, with no concurrent process changing
build paths. Inspect the existing disposable BuildRoot before use and keep its
path short for Flutter on Windows. OutputDirectory must be a new direct child
of BuildRoot; staging is a fresh sibling under that root.
Do not use junctions or symlinks in supplied paths, or build inside repository or
SDK trees. Add retained sensitive directories outside the automatically protected
worktrees, Windows temp trees, PGDATA and PostgreSQL installation with
AdditionalProtectedDirectory. Inspect retained output after a failed build.
Prerequisite: C:\src\flutter-3.44.0\flutter, framework revision 559ffa3f75e7402d65a8def9c28389a9b2e6fe42.
Initial path checks do not protect against malicious concurrent substitution.
No SDK installation, shared-shell replacement, or dependency upgrades occur.
LookupMode defaults to disabled. Explicit local-fixture mode is non-production,
uses only the synthetic service at http://127.0.0.1:8765/api/, and must never
be used for production publication.
#>
param(
    [Parameter(Mandatory = $true)]
    [string] $BuildRoot,
    [Parameter(Mandatory = $true)]
    [string] $OutputDirectory,
    [string[]] $AdditionalProtectedDirectory = @(),
    [string] $LookupMode = 'disabled'
)

if ($LookupMode -cne 'disabled' -and $LookupMode -cne 'local-fixture') {
    throw 'LookupMode must be exactly disabled or local-fixture.'
}
$ownerApiBase = if ($LookupMode -ceq 'local-fixture') { 'http://127.0.0.1:8765/api/' } else { '' }

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-OwnerFixtureMetadata {
    param([string] $Json, [System.Collections.IDictionary] $Expected, [string] $Entrypoint)
    $metadata = ConvertFrom-Json -InputObject $Json -ErrorAction Stop
    if ($null -eq $metadata -or $metadata -isnot [pscustomobject] -or
        @($metadata.PSObject.Properties).Count -ne $Expected.Count) {
        throw 'Fixture metadata must contain exactly the required fields.'
    }
    foreach ($key in $Expected.Keys) {
        $property = @($metadata.PSObject.Properties | Where-Object { $_.Name -ceq $key })
        if ($property.Count -ne 1 -or $null -eq $property[0].Value -or
            $property[0].Value.GetType() -ne $Expected[$key].GetType() -or
            $property[0].Value -cne $Expected[$key]) {
            throw "Fixture metadata field is missing, mistyped, or mismatched: $key"
        }
    }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $Entrypoint).Hash -cne $metadata.compiledEntrypointSha256) {
        throw 'Fixture metadata entrypoint hash differs from the compiled artifact.'
    }
}

function Write-OwnerFixtureMetadata {
    param(
        $OutputLease,
        [string] $SourceHead,
        [string] $BuildScriptSha256,
        [string] $FlutterFrameworkRevision,
        [string] $PubspecLockSha256
    )
    if ($SourceHead -cnotmatch '^[0-9a-f]{40}$' -or
        $BuildScriptSha256 -cnotmatch '^[0-9A-F]{64}$' -or
        $PubspecLockSha256 -cnotmatch '^[0-9A-F]{64}$' -or
        $FlutterFrameworkRevision -cne '559ffa3f75e7402d65a8def9c28389a9b2e6fe42') {
        throw 'Fixture metadata requires verified source and toolchain identities.'
    }
    $OutputLease.ValidateOwnership()
    $entrypoint = Join-Path $OutputLease.Path 'main.dart.js'
    $entryInfo = Get-Item -LiteralPath $entrypoint -Force -ErrorAction Stop
    if ($entryInfo.PSIsContainer -or $entryInfo.Length -eq 0 -or
        ($entryInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Fixture metadata requires a nonempty regular compiled entrypoint.'
    }
    $expected = [ordered]@{
        label = 'NON-PRODUCTION ' + [char]0x2014 + ' LOCAL FIXTURE ONLY'
        productionPublishAllowed = $false
        lookupMode = 'local-fixture'
        apiBaseUrl = 'http://127.0.0.1:8765/api/'
        sourceHead = $SourceHead
        buildScriptSha256 = $BuildScriptSha256
        flutterFrameworkRevision = $FlutterFrameworkRevision
        pubspecLockSha256 = $PubspecLockSha256
        compiledEntrypointSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $entrypoint).Hash
    }
    $marker = Join-Path $OutputLease.Path 'NON_PRODUCTION_LOCAL_FIXTURE_ONLY.json'
    if (Test-Path -LiteralPath $marker) { throw 'Fixture metadata marker already exists.' }
    $pending = Join-Path $OutputLease.Path ('.fixture-metadata-' + [guid]::NewGuid().ToString('N') + '.pending')
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($expected | ConvertTo-Json -Depth 3))
    $stream = [IO.File]::Open($pending, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
        $stream.Position = 0
        $reader = [IO.StreamReader]::new($stream, [Text.UTF8Encoding]::new($false, $true), $false, 1024, $true)
        try { $writtenJson = $reader.ReadToEnd() } finally { $reader.Dispose() }
        Assert-OwnerFixtureMetadata -Json $writtenJson -Expected $expected -Entrypoint $entrypoint
        $OutputLease.ValidateOwnership()
    } finally { $stream.Dispose() }
    # Same-directory rename publishes only validated bytes; this overload never overwrites.
    # Failures retain the pending file for inspection, without a complete marker.
    [IO.File]::Move($pending, $marker)
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'This script requires Windows.' }

# Resolve aliases through Windows handles. Creation uses FILE_CREATE relative to a
# pinned parent handle: an existing directory can never become invocation-owned.
# Cleanup pins and inspects the entire tree without following reparse points, then
# deletes only those verified handles. It never calls a recursive path-based delete.
$pathSafetyCode = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace OwnerWebSafety {
    internal static class Native {
        internal const uint ReadAttributes = 0x80, ListDirectory = 1, DeleteAccess = 0x10000;
        internal const uint ShareRead = 1, ShareWrite = 2, ShareDelete = 4;
        internal const uint DirectoryAttribute = 0x10, ReparseAttribute = 0x400;
        [StructLayout(LayoutKind.Sequential)] internal struct Info {
            internal uint Attributes;
            internal System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
            internal uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
        }
        [StructLayout(LayoutKind.Sequential)] struct UnicodeString { public ushort Length, MaximumLength; public IntPtr Buffer; }
        [StructLayout(LayoutKind.Sequential)] struct ObjectAttributes {
            public int Length; public IntPtr RootDirectory, ObjectName; public uint Attributes;
            public IntPtr SecurityDescriptor, SecurityQualityOfService;
        }
        [StructLayout(LayoutKind.Sequential)] struct IoStatus { public IntPtr Status, Information; }
        [StructLayout(LayoutKind.Sequential)] struct Disposition { [MarshalAs(UnmanagedType.U1)] public bool Delete; }
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", SetLastError=true)]
        static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Info info);
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder name, uint length, uint flags);
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        static extern uint GetFileAttributesW(string path);
        [DllImport("kernel32.dll", SetLastError=true)]
        static extern bool SetFileInformationByHandle(SafeFileHandle handle, int kind, ref Disposition data, uint size);
        [DllImport("ntdll.dll")] static extern int NtCreateFile(out SafeFileHandle handle, uint access,
            ref ObjectAttributes attributes, out IoStatus status, IntPtr allocation, uint fileAttributes,
            uint share, uint disposition, uint options, IntPtr ea, uint eaLength);
        [DllImport("ntdll.dll")] static extern uint RtlNtStatusToDosError(int status);

        internal static string Normalize(string path) {
            if (String.IsNullOrWhiteSpace(path) || path.Length < 3 || !Char.IsLetter(path[0]) ||
                path[1] != ':' || (path[2] != '\\' && path[2] != '/') || path.IndexOf(':', 2) >= 0)
                throw new IOException("An absolute local drive path is required: " + path);
            // Check before GetFullPath can trim a trailing dot or space.
            foreach (string part in path.Replace('/', '\\').Substring(3).Split('\\'))
                if (part == "." || part == ".." || part.EndsWith(".") || part.EndsWith(" "))
                    throw new IOException("Ambiguous Windows path: " + path);
            string full = Path.GetFullPath(path).Replace('/', '\\');
            foreach (string part in full.Substring(3).Split('\\')) {
                if (part.EndsWith(".") || part.EndsWith(" ") || part.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                    throw new IOException("Ambiguous Windows path: " + path);
                string stem = part.Split('.')[0].ToUpperInvariant();
                if (stem == "CON" || stem == "PRN" || stem == "AUX" || stem == "NUL" ||
                    (stem.Length == 4 && (stem.StartsWith("COM") || stem.StartsWith("LPT")) && stem[3] >= '1' && stem[3] <= '9'))
                    throw new IOException("Reserved Windows path: " + path);
            }
            return full.Length == 3 ? full : full.TrimEnd('\\');
        }
        internal static bool Inside(string path, string root) {
            return String.Equals(path, root, StringComparison.OrdinalIgnoreCase) ||
                path.StartsWith(root.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase);
        }
        internal static SafeFileHandle Open(string path, uint access, uint share, bool noFollow) {
            SafeFileHandle h = CreateFileW(@"\\?\" + path, access, share, IntPtr.Zero, 3,
                0x02000000u | (noFollow ? 0x00200000u : 0u), IntPtr.Zero);
            if (h.IsInvalid) { int error = Marshal.GetLastWin32Error(); h.Dispose(); throw new Win32Exception(error, "Cannot safely open " + path); }
            return h;
        }
        internal static Info Information(SafeFileHandle h) {
            Info info; if (!GetFileInformationByHandle(h, out info)) throw new Win32Exception(Marshal.GetLastWin32Error());
            return info;
        }
        internal static bool Same(Info a, Info b) { return a.Volume == b.Volume && a.IndexHigh == b.IndexHigh && a.IndexLow == b.IndexLow; }
        internal static string Final(SafeFileHandle h) {
            StringBuilder b = new StringBuilder(32768);
            uint count = GetFinalPathNameByHandleW(h, b, (uint)b.Capacity, 0);
            if (count == 0 || count >= b.Capacity) throw new IOException("Cannot resolve the effective filesystem destination.");
            string value = b.ToString();
            if (!value.StartsWith(@"\\?\") || value.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase))
                throw new IOException("Only resolved local filesystem destinations are supported.");
            return Normalize(value.Substring(4));
        }
        internal static bool Exists(string path) {
            if (GetFileAttributesW(@"\\?\" + path) != UInt32.MaxValue) return true;
            int error = Marshal.GetLastWin32Error();
            if (error == 2 || error == 3) return false;
            throw new Win32Exception(error, "Cannot establish whether this path exists: " + path);
        }
        internal static SafeFileHandle CreateDirectory(SafeFileHandle parent, string leaf) {
            UnicodeString name = new UnicodeString();
            name.Buffer = Marshal.StringToHGlobalUni(leaf); name.Length = checked((ushort)(leaf.Length * 2)); name.MaximumLength = (ushort)(name.Length + 2);
            IntPtr namePtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(UnicodeString)));
            try {
                Marshal.StructureToPtr(name, namePtr, false);
                ObjectAttributes attributes = new ObjectAttributes();
                attributes.Length = Marshal.SizeOf(typeof(ObjectAttributes)); attributes.RootDirectory = parent.DangerousGetHandle();
                attributes.ObjectName = namePtr; attributes.Attributes = 0x40;
                SafeFileHandle h; IoStatus io;
                // FILE_CREATE (2) fails on collision; the returned handle identifies
                // the newly created directory atomically, without a create/open gap.
                int status = NtCreateFile(out h, ReadAttributes | DeleteAccess | 0x100000, ref attributes, out io,
                    IntPtr.Zero, DirectoryAttribute, ShareRead | ShareWrite, 2, 0x21, IntPtr.Zero, 0);
                if (status < 0) { if (h != null) h.Dispose(); throw new Win32Exception((int)RtlNtStatusToDosError(status), "Exclusive directory creation failed: " + leaf); }
                return h;
            } finally { Marshal.FreeHGlobal(namePtr); Marshal.FreeHGlobal(name.Buffer); }
        }
        internal static FileStream CreateMarker(string path) {
            SafeFileHandle h = CreateFileW(@"\\?\" + path, 0xC0000000u | DeleteAccess, ShareRead, IntPtr.Zero, 1, 0x00200000, IntPtr.Zero);
            if (h.IsInvalid) { int error = Marshal.GetLastWin32Error(); h.Dispose(); throw new Win32Exception(error, "Cannot establish staging ownership."); }
            return new FileStream(h, FileAccess.ReadWrite);
        }
        internal static void Delete(SafeFileHandle h) {
            Disposition data = new Disposition(); data.Delete = true;
            if (!SetFileInformationByHandle(h, 4, ref data, (uint)Marshal.SizeOf(typeof(Disposition))))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Verified handle deletion failed; directory is retained.");
        }
    }

    public sealed class Context : IDisposable {
        readonly List<string> protectedRoots = new List<string>();
        readonly List<SafeFileHandle> protectedHandles = new List<SafeFileHandle>();
        bool disposed;
        public Context(string[] roots) {
            try {
                foreach (string root in roots) {
                    string logical = Native.Normalize(root);
                    string physical = ResolveDirectory(logical);
                    SafeFileHandle h = Native.Open(physical, Native.ReadAttributes | Native.ListDirectory, Native.ShareRead | Native.ShareWrite, true);
                    if ((Native.Information(h).Attributes & (Native.DirectoryAttribute | Native.ReparseAttribute)) != Native.DirectoryAttribute) {
                        h.Dispose(); throw new IOException("Protected root is not a verified directory: " + root);
                    }
                    protectedHandles.Add(h); protectedRoots.Add(logical); protectedRoots.Add(Native.Final(h));
                }
            } catch { Dispose(); throw; }
        }
        public static string ResolveDirectory(string path) {
            using (SafeFileHandle h = Native.Open(Native.Normalize(path), Native.ReadAttributes | Native.ListDirectory,
                Native.ShareRead | Native.ShareWrite | Native.ShareDelete, false)) {
                if ((Native.Information(h).Attributes & Native.DirectoryAttribute) == 0) throw new IOException("Parent must be an existing directory: " + path);
                return Native.Final(h);
            }
        }
        public static bool PathExists(string path) { return Native.Exists(Native.Normalize(path)); }
        static void CheckUnlinkedComponents(string path, bool freshLeaf) {
            string logical = Native.Normalize(path);
            string current = System.IO.Path.GetPathRoot(logical);
            string[] parts = logical.Substring(current.Length).Split(new char[] {'\\'}, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0) throw new IOException("A disposable build directory cannot be a drive root.");
            for (int i = -1; i < parts.Length; i++) {
                if (i >= 0) current = System.IO.Path.Combine(current, parts[i]);
                try {
                    using (SafeFileHandle h = Native.Open(current, Native.ReadAttributes | Native.ListDirectory,
                        Native.ShareRead | Native.ShareWrite | Native.ShareDelete, true)) {
                        Native.Info info = Native.Information(h);
                        if ((info.Attributes & (Native.DirectoryAttribute | Native.ReparseAttribute)) != Native.DirectoryAttribute ||
                            !String.Equals(Native.Final(h), current, StringComparison.OrdinalIgnoreCase))
                            throw new IOException("Build path contains a file, reparse point, or unresolved alias: " + current);
                        if (freshLeaf && i == parts.Length - 1) throw new IOException("Output directory already exists: " + current);
                    }
                } catch (Win32Exception ex) {
                    if (freshLeaf && i == parts.Length - 1 && (ex.NativeErrorCode == 2 || ex.NativeErrorCode == 3))
                        return;
                    throw new IOException("Build path is missing or inaccessible: " + current, ex);
                }
            }
        }
        void Allowed(string path) {
            foreach (string root in protectedRoots) if (Native.Inside(path, root)) throw new IOException("Destination is inside a protected directory: " + path);
        }
        public string ValidateBuildRoot(string requested) {
            string logical = Native.Normalize(requested);
            CheckUnlinkedComponents(logical, false);
            string physical = ResolveDirectory(logical);
            foreach (string root in protectedRoots)
                if (Native.Inside(logical, root) || Native.Inside(root, logical) ||
                    Native.Inside(physical, root) || Native.Inside(root, physical))
                    throw new IOException("Disposable build root overlaps a protected directory: " + logical);
            return physical;
        }
        public string ValidateOutput(string requested, string buildRoot) {
            string logical = Native.Normalize(requested);
            if (!String.Equals(System.IO.Path.GetDirectoryName(logical), buildRoot, StringComparison.OrdinalIgnoreCase))
                throw new IOException("OutputDirectory must be a direct child of BuildRoot.");
            CheckUnlinkedComponents(logical, true);
            Allowed(logical);
            return logical;
        }
        public OwnedDirectory CreateOwnedDirectory(string requested) {
            if (disposed) throw new ObjectDisposedException("Context");
            string logical = Native.Normalize(requested); Allowed(logical);
            string leaf = Path.GetFileName(logical);
            if (String.IsNullOrEmpty(leaf)) throw new IOException("A filesystem root cannot be used as output or staging.");
            string parent = ResolveDirectory(Path.GetDirectoryName(logical));
            string physical = Path.Combine(parent, leaf); Allowed(physical);
            List<SafeFileHandle> pins = new List<SafeFileHandle>();
            SafeFileHandle created = null;
            try {
                string current = Path.GetPathRoot(parent);
                List<string> ancestors = new List<string>(); ancestors.Add(current);
                foreach (string part in parent.Substring(current.Length).Split(new char[] {'\\'}, StringSplitOptions.RemoveEmptyEntries)) {
                    current = Path.Combine(current, part); ancestors.Add(current);
                }
                for (int i = 0; i < ancestors.Count; i++) {
                    string ancestor = ancestors[i];
                    SafeFileHandle h = Native.Open(ancestor, Native.ReadAttributes | Native.ListDirectory,
                        i == ancestors.Count - 1 ? Native.ShareRead : Native.ShareRead | Native.ShareWrite, true);
                    pins.Add(h);
                    if ((Native.Information(h).Attributes & (Native.DirectoryAttribute | Native.ReparseAttribute)) != Native.DirectoryAttribute ||
                        !String.Equals(Native.Final(h), ancestor, StringComparison.OrdinalIgnoreCase))
                        throw new IOException("Destination changed or contains an unverified reparse point: " + ancestor);
                    if (Native.Exists(Path.Combine(ancestor, "PG_VERSION")) || Native.Exists(Path.Combine(ancestor, "postgresql.conf")))
                        throw new IOException("Destination is within PostgreSQL retained data: " + ancestor);
                }
                // NtCreateFile returns the exclusive ownership handle; never adopt an existing path.
                created = Native.CreateDirectory(pins[pins.Count - 1], leaf);
                OwnedDirectory result = new OwnedDirectory(physical, created, pins);
                created = null; pins = null; return result;
            } finally {
                if (created != null) created.Dispose();
                if (pins != null) foreach (SafeFileHandle h in pins) h.Dispose();
            }
        }
        public void Dispose() { if (disposed) return; disposed = true; foreach (SafeFileHandle h in protectedHandles) h.Dispose(); }
    }

    public sealed class OwnedDirectory : IDisposable {
        public string Path { get; private set; }
        readonly SafeFileHandle root;
        readonly List<SafeFileHandle> parents;
        readonly Native.Info identity, markerIdentity;
        readonly FileStream marker;
        readonly byte[] token;
        readonly string markerPath;
        bool disposed, cleaned, markerReleased;
        internal OwnedDirectory(string path, SafeFileHandle handle, List<SafeFileHandle> pins) {
            Path = path; root = handle; parents = pins; identity = Native.Information(root);
            markerPath = System.IO.Path.Combine(path, ".owner-portal-invocation");
            if ((identity.Attributes & (Native.DirectoryAttribute | Native.ReparseAttribute)) != Native.DirectoryAttribute ||
                !String.Equals(Native.Final(root), path, StringComparison.OrdinalIgnoreCase)) throw new IOException("Exclusive directory identity mismatch.");
            marker = Native.CreateMarker(markerPath); markerIdentity = Native.Information(marker.SafeFileHandle);
            token = Encoding.UTF8.GetBytes(Guid.NewGuid().ToString("N")); marker.Write(token, 0, token.Length); marker.Flush(true);
        }
        public void ValidateOwnership() {
            if (disposed || cleaned || markerReleased) throw new IOException("No live invocation ownership is available.");
            Native.Info now = Native.Information(root);
            if (!Native.Same(identity, now) || (now.Attributes & Native.ReparseAttribute) != 0 ||
                !String.Equals(Native.Final(root), Path, StringComparison.OrdinalIgnoreCase) ||
                !Native.Same(markerIdentity, Native.Information(marker.SafeFileHandle))) throw new IOException("Invocation directory identity changed.");
            byte[] actual = new byte[token.Length]; marker.Position = 0;
            if (marker.Length != token.Length || marker.Read(actual, 0, actual.Length) != token.Length) throw new IOException("Ownership marker changed.");
            for (int i = 0; i < token.Length; i++) if (actual[i] != token[i]) throw new IOException("Ownership marker changed.");
        }
        void LockTree(string directory, List<SafeFileHandle> entries) {
            foreach (string path in Directory.EnumerateFileSystemEntries(directory)) {
                if (String.Equals(path, markerPath, StringComparison.OrdinalIgnoreCase)) continue;
                SafeFileHandle h = Native.Open(path, Native.ReadAttributes | Native.DeleteAccess, Native.ShareRead, true);
                entries.Add(h);
                Native.Info info = Native.Information(h);
                if ((info.Attributes & Native.ReparseAttribute) != 0 || !String.Equals(Native.Final(h), path, StringComparison.OrdinalIgnoreCase))
                    throw new IOException("Cleanup refused an unverified reparse point: " + path);
                if ((info.Attributes & Native.DirectoryAttribute) != 0) LockTree(path, entries);
            }
        }
        public void Cleanup() {
            ValidateOwnership();
            List<SafeFileHandle> entries = new List<SafeFileHandle>();
            // The ownership handle denies rename/delete; this second handle denies
            // writes to the root while the no-follow cleanup snapshot is acquired.
            using (SafeFileHandle cleanupLock = Native.Open(Path, Native.ReadAttributes | Native.ListDirectory, Native.ShareRead | Native.ShareDelete, true)) {
                try {
                    if (!Native.Same(identity, Native.Information(cleanupLock))) throw new IOException("Cleanup root identity changed.");
                    LockTree(Path, entries); ValidateOwnership();
                    // No deletion begins until every discovered entry has been pinned and checked.
                    for (int i = entries.Count - 1; i >= 0; i--) { Native.Delete(entries[i]); entries[i].Dispose(); }
                    Native.Delete(marker.SafeFileHandle); marker.Dispose();
                    Native.Delete(root); root.Dispose(); cleaned = true;
                } finally { foreach (SafeFileHandle h in entries) h.Dispose(); }
            }
        }
        public void RetainArtifact() {
            ValidateOwnership(); Native.Delete(marker.SafeFileHandle); marker.Dispose(); markerReleased = true;
        }
        public void Dispose() {
            if (disposed) return; disposed = true;
            marker.Dispose(); root.Dispose(); foreach (SafeFileHandle h in parents) h.Dispose();
        }
    }
}
'@
if (-not ('OwnerWebSafety.Context' -as [type])) { Add-Type -TypeDefinition $pathSafetyCode }

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ($LookupMode -ceq 'local-fixture') {
    $fixtureScriptHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath).Hash
    $fixtureSourceHead = & git -C $repo rev-parse --verify HEAD
    if ($LASTEXITCODE -ne 0 -or $fixtureSourceHead -cnotmatch '^[0-9a-f]{40}$') {
        throw 'Cannot verify fixture source HEAD.'
    }
}
$sourceMobile = Join-Path $repo 'mobile'
$sourceShell = Join-Path $sourceMobile 'web_owner'
$sourceLock = Join-Path $sourceMobile 'pubspec.lock'
$flutterRoot = 'C:\src\flutter-3.44.0\flutter'
$flutter = Join-Path $flutterRoot 'bin\flutter.bat'
$dart = Join-Path $flutterRoot 'bin\cache\dart-sdk\bin\dart.exe'
if (-not (Test-Path -LiteralPath $flutter -PathType Leaf) -or
    -not (Test-Path -LiteralPath $dart -PathType Leaf)) {
    throw "Required isolated Flutter 3.44.0 SDK is unavailable at $flutterRoot."
}
$versionJson = & $flutter --suppress-analytics --version --machine
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify isolated Flutter version.' }
$version = ($versionJson -join "`n") | ConvertFrom-Json
if ($version.frameworkVersion -cne '3.44.0' -or
    $version.frameworkRevision -cne '559ffa3f75e7402d65a8def9c28389a9b2e6fe42' -or
    $version.dartSdkVersion -cne '3.12.0' -or
    -not ([System.IO.Path]::GetFullPath($version.flutterRoot).TrimEnd('\', '/') -ieq
        [System.IO.Path]::GetFullPath($flutterRoot).TrimEnd('\', '/'))) {
    throw 'Isolated Flutter SDK version, revision, Dart version, or root does not match the required toolchain.'
}
Write-Host "Toolchain: Flutter $($version.frameworkVersion) ($($version.frameworkRevision)); Dart $($version.dartSdkVersion); $flutterRoot"
$worktreeInfo = @(& git -C $repo worktree list --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate Git worktrees.' }
$worktreePaths = @($worktreeInfo | Where-Object { $_ -like 'worktree *' } | ForEach-Object { $_.Substring(9) })
if ($worktreePaths.Count -eq 0) { throw 'No protected Git worktrees were found.' }
$protected = @($worktreePaths) + @(
    $flutterRoot,
    [System.IO.Path]::GetTempPath(),
    (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Temp')
) + $AdditionalProtectedDirectory
$pgData = [Environment]::GetEnvironmentVariable('PGDATA')
if (-not [string]::IsNullOrWhiteSpace($pgData)) { $protected += $pgData }
$postgresInstall = Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'PostgreSQL'
if ([OwnerWebSafety.Context]::PathExists($postgresInstall)) { $protected += $postgresInstall }
# Resolving every protected root must succeed before any output or staging write.
$pathSafety = [OwnerWebSafety.Context]::new([string[]]($protected | Select-Object -Unique))
$outputLease = $null
$stageLease = $null
$operationFailed = $false

try {
    $approvedRoot = $pathSafety.ValidateBuildRoot($BuildRoot)
    $approvedOutput = $pathSafety.ValidateOutput($OutputDirectory, $approvedRoot)
    $outputLease = $pathSafety.CreateOwnedDirectory($approvedOutput)
    $output = $outputLease.Path
    Write-Host "Invocation-owned output created: $output"
    $stageLease = $pathSafety.CreateOwnedDirectory((Join-Path $approvedRoot ('.owner-portal-web-stage-' + [guid]::NewGuid().ToString('N'))))
    $tempRoot = $stageLease.Path
    $stageMobile = Join-Path $tempRoot 'mobile'
    $stageWeb = Join-Path $stageMobile 'web'
    Write-Host "Owned staging directory: $tempRoot"
    Write-Host "Resolved output directory: $output"

    $before = @(& git -C $repo status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read source Git status.' }
    $sourceLockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceLock).Hash
    Write-Host "Source pubspec.lock SHA256: $sourceLockHash"
    [System.IO.Directory]::CreateDirectory($stageMobile) | Out-Null

    # Stage only tracked mobile files; Flutter may write freely in this copy.
    $tracked = & git -C $repo ls-files --cached --full-name -- mobile
    if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate tracked mobile files.' }
    foreach ($relative in $tracked) {
        $from = Join-Path $repo $relative
        $withinMobile = $relative.Substring('mobile/'.Length)
        $to = Join-Path $stageMobile $withinMobile
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($to)) | Out-Null
        [System.IO.File]::Copy($from, $to, $true)
    }

    $stageLock = Join-Path $stageMobile 'pubspec.lock'
    $stagedLockBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath $stageLock).Hash
    Write-Host "Staged pubspec.lock SHA256 before pub get: $stagedLockBefore"
    if ($stagedLockBefore -cne $sourceLockHash) { throw 'Staged lockfile differs from source before resolution.' }

    # Replace the shared shell only in the disposable build copy.
    [System.IO.File]::Copy((Join-Path $sourceShell 'index.html'), (Join-Path $stageWeb 'index.html'), $true)
    [System.IO.File]::Copy((Join-Path $sourceShell 'manifest.json'), (Join-Path $stageWeb 'manifest.json'), $true)

    # Generate correctly sized icons from the existing approved Sanitation favicon.
    Add-Type -AssemblyName System.Drawing
    $favicon = Join-Path $stageWeb 'favicon_sanitation.png'
    $iconDir = Join-Path $stageWeb 'icons'
    $original = [System.Drawing.Image]::FromFile($favicon)
    try {
        foreach ($size in @(192, 512)) {
            $bitmap = New-Object System.Drawing.Bitmap($size, $size)
            try {
                $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
                try {
                    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $graphics.DrawImage($original, 0, 0, $size, $size)
                } finally { $graphics.Dispose() }
                $bitmap.Save((Join-Path $iconDir "Icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
            } finally { $bitmap.Dispose() }
        }
    } finally { $original.Dispose() }

    $stageLease.ValidateOwnership()
    $outputLease.ValidateOwnership()
    Push-Location $stageMobile
    try {
        Write-Host ($flutter + ' --suppress-analytics pub get --enforce-lockfile')
        & $flutter --suppress-analytics pub get --enforce-lockfile
        if ($LASTEXITCODE -ne 0) { throw "Locked dependency resolution failed with exit code $LASTEXITCODE." }
        $stagedLockAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $stageLock).Hash
        Write-Host "Staged pubspec.lock SHA256 after pub get: $stagedLockAfter"
        if ($stagedLockAfter -cne $sourceLockHash) { throw 'Staged lockfile changed during dependency resolution.' }

        $flutterArgs = @(
            '--suppress-analytics', 'build', 'web', '--release', '--no-pub',
            '--target=lib/main_sanitation_public.dart', '--base-href=/',
            '--no-web-resources-cdn',
            "--dart-define=SANITATION_OWNER_LOOKUP_MODE=$LookupMode",
            "--dart-define=SANITATION_OWNER_API_BASE_URL=$ownerApiBase",
            "--output=$output"
        )
        Write-Host ($flutter + ' ' + ($flutterArgs -join ' '))
        & $flutter @flutterArgs
        if ($LASTEXITCODE -ne 0) { throw "Flutter build failed with exit code $LASTEXITCODE." }
        $stagedLockAfterBuild = (Get-FileHash -Algorithm SHA256 -LiteralPath $stageLock).Hash
        if ($stagedLockAfterBuild -cne $sourceLockHash) { throw 'Staged lockfile changed during build.' }
    } finally { Pop-Location }

    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $sourceLock).Hash -cne $sourceLockHash) {
        throw 'Source lockfile changed during build.'
    }

    $after = @(& git -C $repo status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify source Git status.' }
    if (($before -join "`n") -cne ($after -join "`n")) { throw 'Source Git status changed during build.' }
    if ($LookupMode -ceq 'local-fixture') {
        $finalSourceHead = & git -C $repo rev-parse --verify HEAD
        if ($LASTEXITCODE -ne 0 -or $finalSourceHead -cne $fixtureSourceHead -or
            (Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath).Hash -cne $fixtureScriptHash) {
            throw 'Fixture source HEAD or build script changed during build.'
        }
        Write-OwnerFixtureMetadata -OutputLease $outputLease -SourceHead $fixtureSourceHead `
            -BuildScriptSha256 $fixtureScriptHash -FlutterFrameworkRevision $version.frameworkRevision `
            -PubspecLockSha256 $sourceLockHash
    }
    $outputLease.RetainArtifact()
    Write-Host "Build artifact: $output"
    Write-Host 'Source Git status unchanged.'
} catch {
    $operationFailed = $true
    if ($null -ne $outputLease) { Write-Warning "Partial output retained at $($outputLease.Path). Inspect it before reuse." }
    throw
} finally {
    $cleanupFailure = $null
    if ($null -ne $stageLease) {
        try {
            $stageLease.Cleanup()
            Write-Host 'Verified owned staging directory removed.'
        } catch {
            $cleanupFailure = $_
            Write-Warning "Cleanup refused; staging retained at $($stageLease.Path): $($_.Exception.Message)"
        } finally { $stageLease.Dispose() }
    }
    if ($null -ne $outputLease) { $outputLease.Dispose() }
    $pathSafety.Dispose()
    # Partial output is retained on failure; no unowned/output directory is deleted.
    if ($null -ne $cleanupFailure -and -not $operationFailed) { throw $cleanupFailure }
}
