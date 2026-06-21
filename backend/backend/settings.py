from pathlib import Path

from decouple import Config, RepositoryEnv


BASE_DIR = Path(__file__).resolve().parent.parent

ENV_FILE = BASE_DIR / ".env"
config = Config(RepositoryEnv(str(ENV_FILE)))


def csv_config(name, default):
    return [
        value.strip()
        for value in config(name, default=default).split(",")
        if value.strip()
    ]


def bool_config(name, default=False):
    value = config(name, default=str(default))

    if isinstance(value, bool):
        return value

    normalized = str(value).strip().lower()
    if normalized in {
        "1",
        "true",
        "t",
        "yes",
        "y",
        "on",
        "debug",
        "dev",
        "development",
    }:
        return True
    if normalized in {
        "0",
        "false",
        "f",
        "no",
        "n",
        "off",
        "release",
        "prod",
        "production",
    }:
        return False

    raise ValueError(f"{name} must be a boolean-like value.")


# Core
SECRET_KEY = config("SECRET_KEY")

DEBUG = bool_config("DEBUG", default=True)

USE_SEED_DATA = bool_config("USE_SEED_DATA", default=True)

ALLOWED_HOSTS = csv_config(
    "ALLOWED_HOSTS",
    "127.0.0.1,localhost,testserver",
)


# Apps
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "corsheaders",
    "rest_framework",
    "rest_framework.authtoken",
]

LOCAL_APPS = [
    "api",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "backend.wsgi.application"


# Database
DB_ENGINE = config("DB_ENGINE", default="postgresql").strip().lower()

if DB_ENGINE == "sqlite":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": config("SQLITE_DB_PATH", default=str(BASE_DIR / "db.sqlite3")),
        }
    }
else:
    DATABASE_OPTIONS = {}
    DB_SSLMODE = config("DB_SSLMODE", default="")

    if DB_SSLMODE:
        DATABASE_OPTIONS["sslmode"] = DB_SSLMODE

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": config("DB_NAME"),
            "USER": config("DB_USER"),
            "PASSWORD": config("DB_PASSWORD"),
            "HOST": config("DB_HOST", default="localhost"),
            "PORT": config("DB_PORT", default="5433"),
            "OPTIONS": DATABASE_OPTIONS,
        }
    }


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# Internationalization
LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True


# API / CORS
CORS_ALLOW_ALL_ORIGINS = bool_config("CORS_ALLOW_ALL_ORIGINS", default=True)

CORS_ALLOWED_ORIGINS = csv_config(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001,"
    "http://127.0.0.1:3000,http://127.0.0.1:3001",
)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}


# Static files (CSS, JavaScript, Images)
STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
