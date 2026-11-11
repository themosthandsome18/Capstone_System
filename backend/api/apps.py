from django.apps import AppConfig


class ApiConfig(AppConfig):
    name = 'api'

    def ready(self):
        from .services.establishment_retention import register_establishment_retention
        from .services.public_reporting import register_public_submission_retention
        from .services.tracking_codes import warn_if_tracking_code_key_missing
        from .services.household_photos import register_household_photo_cleanup

        register_establishment_retention()
        register_public_submission_retention()
        warn_if_tracking_code_key_missing()
        register_household_photo_cleanup()
