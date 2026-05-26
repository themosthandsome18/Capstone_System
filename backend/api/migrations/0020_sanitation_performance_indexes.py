from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0019_touristrecord_tourist_status_arrival_idx_and_more"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="sanitaryestablishment",
            index=models.Index(fields=["barangay"], name="san_est_barangay_idx"),
        ),
        migrations.AddIndex(
            model_name="sanitaryestablishment",
            index=models.Index(
                fields=["business_type", "compliance_status"],
                name="san_est_type_status_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="sanitaryestablishment",
            index=models.Index(fields=["permit_status"], name="san_est_permit_idx"),
        ),
        migrations.AddIndex(
            model_name="sanitaryestablishment",
            index=models.Index(
                fields=["compliance_status"],
                name="san_est_compliance_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="sanitaryestablishment",
            index=models.Index(fields=["updated_at"], name="san_est_updated_idx"),
        ),
        migrations.AddIndex(
            model_name="sanitarypermitrenewal",
            index=models.Index(
                fields=["stage", "expiration_date"],
                name="san_ren_stage_exp_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="sanitarypermitrenewal",
            index=models.Index(
                fields=["payment_status", "expiration_date"],
                name="san_ren_pay_exp_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="sanitarypermitrenewal",
            index=models.Index(
                fields=["establishment", "expiration_date"],
                name="san_ren_est_exp_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="sanitarycomplaint",
            index=models.Index(
                fields=["status", "priority"],
                name="san_comp_status_pri_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="sanitarycomplaint",
            index=models.Index(
                fields=["barangay", "status"],
                name="san_comp_brgy_status_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="sanitarycomplaint",
            index=models.Index(
                fields=["establishment", "status"],
                name="san_comp_est_status_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="sanitarycomplaint",
            index=models.Index(fields=["reported_date"], name="san_comp_reported_idx"),
        ),
        migrations.AddIndex(
            model_name="sanitaryinspection",
            index=models.Index(
                fields=["establishment", "inspection_date"],
                name="san_insp_est_date_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="sanitaryinspection",
            index=models.Index(fields=["next_due_date"], name="san_insp_due_idx"),
        ),
        migrations.AddIndex(
            model_name="sanitaryinspection",
            index=models.Index(
                fields=["status_after_inspection"],
                name="san_insp_status_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="householdsanitationrecord",
            index=models.Index(
                fields=["barangay", "status"],
                name="hh_san_brgy_status_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="householdsanitationrecord",
            index=models.Index(fields=["status"], name="hh_san_status_idx"),
        ),
        migrations.AddIndex(
            model_name="householdsanitationrecord",
            index=models.Index(
                fields=["last_survey_date"],
                name="hh_san_survey_idx",
            ),
        ),
    ]
