part of '../main.dart';

/// Existing-profile photos are independent of household survey/GPS submission.
class HouseholdFrontPhotoPanel extends StatefulWidget {
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
  State<HouseholdFrontPhotoPanel> createState() =>
      _HouseholdFrontPhotoPanelState();
}

class _HouseholdFrontPhotoPanelState extends State<HouseholdFrontPhotoPanel> {
  late final ImagePicker _picker = widget.imagePicker ?? ImagePicker();
  String? _token;
  SharedPreferences? _prefs;
  int _generation = 0;
  bool _invalid = false;
  Uint8List? _saved, _draft;
  bool _busy = true, _ready = false;
  String? _error, _notice;
  String _progress = 'Loading household photo…';

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
      _error = 'Staff session changed. Reopen the household profile.';
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
        return 'Sign in again to access household photos.';
      }
      if (error.statusCode == 403) {
        return 'You are not authorized to access household photos.';
      }
      if (error.statusCode == 409) {
        return 'Staff session changed. Reopen the household profile.';
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
      _progress = 'Loading household photo…';
    });
    try {
      if (_token == null || _token!.isEmpty) {
        throw const ApiException(statusCode: 401, message: 'Sign in again.');
      }
      final saved = await widget.api.fetchHouseholdFrontPhoto(
        widget.householdId,
        expectedSessionToken: _token!,
      );
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
              ? 'Save household front photo?'
              : 'Replace saved household photo?',
        ),
        content: const Text(
          'Only the front photo changes. Household information and coordinates are preserved.',
        ),
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
      _progress = 'Saving household photo…';
    });
    try {
      final pending = await widget.api.uploadHouseholdFrontPhoto(
        widget.householdId,
        _draft!,
        expectedSessionToken: _token!,
      );
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
      const Text(
        'Household front photo',
        style: TextStyle(fontWeight: FontWeight.bold),
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
              ? 'Household photo preview'
              : 'Saved household front photo',
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
