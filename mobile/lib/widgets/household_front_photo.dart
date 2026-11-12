part of '../main.dart';

/// Which saved record a private front photo belongs to. The id is always the
/// server's record id; the panel is never shown for an unsaved record.
class FrontPhotoTarget {
  const FrontPhotoTarget.household(this.id) : kind = 'household';
  const FrontPhotoTarget.establishment(this.id) : kind = 'establishment';

  final String kind;
  final int id;

  bool get _household => kind == 'household';
  String get title => _household ? 'Household front photo' : 'Establishment front photo';
  String get preserved => _household
      ? 'Only the front photo changes. Household information and coordinates are preserved.'
      : 'Only the front photo changes. Establishment, permit and inspection records are preserved.';

  Future<Uint8List?> fetch(TourismApi api, String token) => _household
      ? api.fetchHouseholdFrontPhoto(id, expectedSessionToken: token)
      : api.fetchEstablishmentFrontPhoto(id, expectedSessionToken: token);

  Future<bool> upload(TourismApi api, Uint8List bytes, String token) => _household
      ? api.uploadHouseholdFrontPhoto(id, bytes, expectedSessionToken: token)
      : api.uploadEstablishmentFrontPhoto(id, bytes, expectedSessionToken: token);
}

/// Existing-profile photos are independent of household survey/GPS submission.
class HouseholdFrontPhotoPanel extends StatelessWidget {
  const HouseholdFrontPhotoPanel({
    super.key,
    required this.api,
    required this.householdId,
    this.imagePicker,
  });
  final TourismApi api;
  final int householdId;
  final ImagePicker? imagePicker;

  @override
  Widget build(BuildContext context) => FrontPhotoPanel(
    api: api,
    target: FrontPhotoTarget.household(householdId),
    imagePicker: imagePicker,
  );
}

/// Private front photo of one saved record: load, pick (camera/gallery), preview,
/// confirm, upload/replace and retry. Clears on any staff-session change.
class FrontPhotoPanel extends StatefulWidget {
  const FrontPhotoPanel({
    super.key,
    required this.api,
    required this.target,
    this.imagePicker,
  });
  final TourismApi api;
  final FrontPhotoTarget target;
  final ImagePicker? imagePicker;
  @override
  State<FrontPhotoPanel> createState() => _FrontPhotoPanelState();
}

class _FrontPhotoPanelState extends State<FrontPhotoPanel> {
  late final ImagePicker _picker = widget.imagePicker ?? ImagePicker();
  String? _token;
  SharedPreferences? _prefs;
  int _generation = 0;
  bool _invalid = false;
  Uint8List? _saved, _draft;
  bool _busy = true, _ready = false;
  String? _error, _notice;
  late String _progress = 'Loading ${widget.target.kind} photo…';

  @override
  void initState() {
    super.initState();
    staffSessionRevision.addListener(_invalidate);
    _open();
  }

  void _invalidate() {
    if (!mounted) return;
    setState(() {
      _generation++;
      _invalid = true;
      _saved = null;
      _draft = null;
      _ready = false;
      _busy = false;
      _notice = null;
      _error = 'Staff session changed. Reopen the ${widget.target.kind} profile.';
    });
  }

  bool _current(int generation) {
    if (!mounted || _invalid || generation != _generation) return false;
    if (_token == null ||
        _token!.isEmpty ||
        _prefs?.getString(staffAuthTokenKey) != _token) {
      _invalidate();
      return false;
    }
    return true;
  }

  void _failure(Object error, int generation) {
    if (!_current(generation)) return;
    if (error is ApiException && [401, 403, 409].contains(error.statusCode)) {
      // Only a current-session authentication rejection invalidates all panels.
      // Household permission denials and unclassified conflicts are local.
      if (error.statusCode == 401) {
        staffSessionRevision.value++;
      } else {
        _invalidate();
      }
      setState(() => _error = _message(error));
      return;
    }
    setState(() => _error = _message(error));
  }

  @override
  void dispose() {
    staffSessionRevision.removeListener(_invalidate);
    _generation++;
    _saved = null;
    _draft = null;
    super.dispose();
  }

  Future<void> _open() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted || _invalid) return;
    _prefs = prefs;
    _token = prefs.getString(staffAuthTokenKey);
    await _load();
  }

  String _message(Object error) {
    if (error is ApiException) {
      if (error.statusCode == 401) {
        return 'Sign in again to access ${widget.target.kind} photos.';
      }
      if (error.statusCode == 403) {
        return 'You are not authorized to access ${widget.target.kind} photos.';
      }
      if (error.statusCode == 409) {
        return 'Staff session changed. Reopen the ${widget.target.kind} profile.';
      }
      if (error.statusCode == 503) {
        return 'Private photos are unavailable. Please retry later.';
      }
      return error.message;
    }
    return 'Could not confirm the photo request. Reload to check the saved photo before retrying.';
  }

  Future<void> _load() async {
    final generation = _generation;
    if (!_current(generation)) return;
    setState(() {
      _busy = true;
      _ready = false;
      _saved = null;
      _error = null;
      _progress = 'Loading ${widget.target.kind} photo…';
    });
    try {
      if (_token == null || _token!.isEmpty) {
        throw const ApiException(statusCode: 401, message: 'Sign in again.');
      }
      final saved = await widget.target.fetch(widget.api, _token!);
      if (_current(generation)) {
        setState(() {
          _saved = saved;
          _ready = true;
        });
      }
    } catch (error) {
      _failure(error, generation);
    } finally {
      if (_current(generation)) setState(() => _busy = false);
    }
  }

  Future<void> _pick(ImageSource source) async {
    final generation = _generation;
    if (!_current(generation) || !_ready || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
      _progress = 'Opening camera/gallery…';
    });
    try {
      final photo = await _picker.pickImage(
        source: source,
        imageQuality: 80,
        maxWidth: 1920,
        maxHeight: 1920,
        requestFullMetadata: false,
      );
      if (!_current(generation) || photo == null) return;
      if (await photo.length() > 5 * 1024 * 1024) {
        throw const ApiException(
          statusCode: 400,
          message: 'Choose a JPEG or PNG up to 5 MiB.',
        );
      }
      if (!_current(generation)) return;
      final bytes = await photo.readAsBytes();
      if (bytes.isEmpty || bytes.length > 5 * 1024 * 1024) {
        throw const ApiException(
          statusCode: 400,
          message: 'Choose a JPEG or PNG up to 5 MiB.',
        );
      }
      if (_current(generation)) setState(() => _draft = bytes);
    } on PlatformException {
      if (_current(generation)) {
        setState(
          () => _error =
              'Camera/gallery access is unavailable or denied. Check app permissions in device settings and retry.',
        );
      }
    } catch (error) {
      _failure(error, generation);
    } finally {
      if (_current(generation)) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    final generation = _generation;
    if (!_current(generation)) return;
    if (_draft == null || !_ready || _busy) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          _saved == null
              ? 'Save ${widget.target.kind} front photo?'
              : 'Replace saved ${widget.target.kind} photo?',
        ),
        content: Text(widget.target.preserved),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    if (!_current(generation) || confirmed != true) return;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
      _progress = 'Saving ${widget.target.kind} photo…';
    });
    try {
      final pending = await widget.target.upload(widget.api, _draft!, _token!);
      if (!_current(generation)) {
        return;
      }
      setState(() {
        _draft = null;
        _saved = null;
        _notice = pending
            ? 'Photo saved. Previous-file cleanup is pending.'
            : 'Photo saved.';
      });
      await _load();
    } catch (error) {
      _failure(error, generation);
    } finally {
      if (_current(generation)) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        widget.target.title,
        style: const TextStyle(fontWeight: FontWeight.bold),
      ),
      if (_busy) Text(_progress),
      if (_draft != null) const Text('Preview — not saved'),
      if (_draft != null || _saved != null)
        Image.memory(
          _draft ?? _saved!,
          key: ValueKey(_draft ?? _saved),
          height: 180,
          fit: BoxFit.contain,
          semanticLabel: _draft != null
              ? '${widget.target.kind[0].toUpperCase()}${widget.target.kind.substring(1)} photo preview'
              : 'Saved ${widget.target.kind} front photo',
          errorBuilder: (_, _, _) => const Text(
            'Photo cannot be previewed. Choose a valid JPEG or PNG.',
          ),
        ),
      if (_ready && _saved == null && _draft == null)
        const Text('No front photo saved.'),
      if (_error != null)
        Text(_error!, style: const TextStyle(color: Colors.red)),
      if (_notice != null) Text(_notice!),
      Wrap(
        spacing: 8,
        children: [
          TextButton(
            onPressed: _busy || !_ready
                ? null
                : () => _pick(ImageSource.camera),
            child: const Text('Take Photo'),
          ),
          TextButton(
            onPressed: _busy || !_ready
                ? null
                : () => _pick(ImageSource.gallery),
            child: const Text('Choose from Gallery'),
          ),
          if (_draft != null) ...[
            TextButton(
              onPressed: _busy || !_ready ? null : _save,
              child: Text(_saved == null ? 'Save Photo' : 'Replace Photo'),
            ),
            TextButton(
              onPressed: _busy
                  ? null
                  : () => setState(() {
                      _draft = null;
                      _error = null;
                    }),
              child: const Text('Cancel Preview'),
            ),
          ],
          TextButton(
            onPressed: _busy || _invalid ? null : _load,
            child: Text(_error == null ? 'Reload Photo' : 'Retry Photo'),
          ),
        ],
      ),
    ],
  );
}
