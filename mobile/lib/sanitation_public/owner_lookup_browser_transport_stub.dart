import 'owner_lookup_client.dart';

/// Public fixture lookup has no transport on VM or native platforms.
OwnerLookupTransport? createOwnerLookupTransport() => null;
