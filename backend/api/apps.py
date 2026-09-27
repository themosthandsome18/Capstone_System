from django.apps import AppConfig


class ApiConfig(AppConfig):
    name = 'api'

    def ready(self):
        from .services.tracking_codes import warn_if_tracking_code_key_missing

        warn_if_tracking_code_key_missing()
