from django.apps import AppConfig


class ApiConfig(AppConfig):
    name = 'api'

    def ready(self):
        from .services.public_reporting import register_public_submission_retention
        from .services.tracking_codes import warn_if_tracking_code_key_missing

        register_public_submission_retention()
        warn_if_tracking_code_key_missing()
