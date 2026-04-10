from django.db import models

class TouristStat(models.Model):
    total_arrivals = models.IntegerField()
    monthly_visits = models.IntegerField()
    top_destinations = models.IntegerField()
    satisfaction = models.FloatField()


