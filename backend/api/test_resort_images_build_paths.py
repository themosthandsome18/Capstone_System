"""Migration 0066 takes the web's build paths ("/static/media/...") out of Resort.images, and touches nothing else."""
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

BEFORE = [("api", "0065_boatcapacityfare_pax_constraints")]
AFTER = [("api", "0066_resort_images_without_build_paths")]

BUILD = "/static/media/Dona Choleng Camping Resort - Cagbalete.68a26fe8bbc35d2f6ae3.jpg"
REAL = "/media/resorts/43d9269e87cb4fa6810aa6e38b8961f0.png"
S3 = "https://abcd.supabase.co/storage/v1/object/public/media/resorts/aa11.png"


class ResortImagesBuildPathsTests(TransactionTestCase):
    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())

    def run_migration(self, lists):
        executor = MigrationExecutor(connection)
        executor.migrate(BEFORE)
        Resort = executor.loader.project_state(BEFORE).apps.get_model("api", "Resort")
        Resort.objects.all().delete()
        for pk, images in enumerate(lists, start=1):
            Resort.objects.create(
                resort_id=pk, resort_name=f"R{pk}", type="t", location="l", short_description="d", access="a",
                latitude=1, longitude=1, images=images,
            )
        executor = MigrationExecutor(connection)
        executor.migrate(AFTER)
        Resort = executor.loader.project_state(AFTER).apps.get_model("api", "Resort")
        return {r.resort_id: r.images for r in Resort.objects.all()}

    def test_a_destination_with_only_a_build_path_is_cleaned(self):
        after = self.run_migration([[BUILD]])
        self.assertEqual(after[1], [])

    def test_a_real_upload_and_a_whole_url_are_not_touched_and_keep_their_order(self):
        after = self.run_migration([[REAL, BUILD, S3], [S3, REAL]])
        self.assertEqual(after[1], [REAL, S3])  # the build path is gone, the rest in order
        self.assertEqual(after[2], [S3, REAL])  # nothing to remove: as it was

    def test_only_an_entry_that_STARTS_with_the_prefix_is_removed(self):
        keep = [
            "https://example.com/static/media/x.jpg",  # a whole URL that happens to contain it
            "static/media/x.jpg",  # not the path of the build
            "assets/destinations/x.jpg",
            "/media/static/media/x.jpg",
            "",
        ]
        after = self.run_migration([keep + [BUILD]])
        self.assertEqual(after[1], keep)

    def test_empty_lists_and_other_values_are_left_alone(self):
        after = self.run_migration([[], {"not": "a list"}])
        self.assertEqual(after[1], [])
        self.assertEqual(after[2], {"not": "a list"})

    def test_several_build_paths_in_one_list_all_go(self):
        after = self.run_migration([[BUILD, REAL, "/static/media/other.1234.png"]])
        self.assertEqual(after[1], [REAL])

    def test_running_it_twice_changes_nothing_more(self):
        self.run_migration([[BUILD, REAL]])
        executor = MigrationExecutor(connection)
        executor.migrate(BEFORE)
        executor = MigrationExecutor(connection)
        executor.migrate(AFTER)
        Resort = executor.loader.project_state(AFTER).apps.get_model("api", "Resort")
        self.assertEqual(Resort.objects.get(resort_id=1).images, [REAL])
