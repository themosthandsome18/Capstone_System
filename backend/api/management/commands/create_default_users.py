from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from api.models import ROLE_ADMIN, ROLE_SANITATION, ROLE_TOURISM, UserProfile


DEFAULT_USERS = [
    {
        "username": "tourism_admin",
        "password": "Tourism@123",
        "first_name": "Tourism",
        "last_name": "Office",
        "role": ROLE_TOURISM,
        "is_staff": True,
    },
    {
        "username": "sanitation_admin",
        "password": "Sanitation@123",
        "first_name": "Sanitary",
        "last_name": "Section",
        "role": ROLE_SANITATION,
        "is_staff": True,
    },
    {
        "username": "system_admin",
        "password": "Admin@123",
        "first_name": "System",
        "last_name": "Admin",
        "role": ROLE_ADMIN,
        "is_staff": True,
        "is_superuser": True,
    },
]


class Command(BaseCommand):
    help = "Create the fixed demo login accounts for the capstone system."

    def handle(self, *args, **options):
        for account in DEFAULT_USERS:
            role = account["role"]
            password = account["password"]
            username = account["username"]

            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "first_name": account["first_name"],
                    "last_name": account["last_name"],
                    "is_staff": account.get("is_staff", False),
                    "is_superuser": account.get("is_superuser", False),
                },
            )

            user.first_name = account["first_name"]
            user.last_name = account["last_name"]
            user.is_staff = account.get("is_staff", False)
            user.is_superuser = account.get("is_superuser", False)
            user.set_password(password)
            user.save()

            UserProfile.objects.update_or_create(
                user=user,
                defaults={"role": role},
            )

            action = "created" if created else "updated"
            self.stdout.write(
                self.style.SUCCESS(f"{username} {action} with role {role}.")
            )
