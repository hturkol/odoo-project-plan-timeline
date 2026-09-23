from datetime import date, timedelta

from odoo import fields
from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestPlanTimeline(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.today = fields.Date.context_today(cls.env["project.task"])
        cls.stage_todo = cls.env["project.task.type"].create({"name": "Yapılacak", "sequence": 1})
        cls.stage_done = cls.env["project.task.type"].create({"name": "Bitti", "sequence": 9, "fold": True})
        cls.project = cls.env["project.project"].create({
            "name": "Test Projesi",
            "type_ids": [(6, 0, (cls.stage_todo | cls.stage_done).ids)],
        })

    def _task(self, **vals):
        return self.env["project.task"].create({
            "name": "Görev", "project_id": self.project.id, "stage_id": self.stage_todo.id, **vals,
        })

    def test_done_stage_default_from_fold(self):
        self.assertTrue(self.stage_done.schedule_is_done_stage)
        self.assertFalse(self.stage_todo.schedule_is_done_stage)

    def test_completion_date_set_and_cleared(self):
        task = self._task()
        self.assertFalse(task.schedule_date_done)
        task.stage_id = self.stage_done
        self.assertEqual(task.schedule_date_done, self.today)
        task.stage_id = self.stage_todo
        self.assertFalse(task.schedule_date_done)

    def test_completion_date_on_state_done(self):
        task = self._task()
        task.state = "1_done"
        self.assertEqual(task.schedule_date_done, self.today)

    def test_completion_date_kept_when_manually_set(self):
        task = self._task()
        task.stage_id = self.stage_done
        task.schedule_date_done = date(2026, 1, 15)
        task.state = "1_done"
        self.assertEqual(task.schedule_date_done, date(2026, 1, 15))

    def test_date_constraint(self):
        with self.assertRaises(ValidationError):
            self._task(schedule_date_start=self.today, schedule_date_end=self.today - timedelta(days=1))

    def test_metrics(self):
        t = self.today
        cases = [
            (dict(), "no_plan", 0),
            (dict(schedule_date_start=t + timedelta(3), schedule_date_end=t + timedelta(10)), "not_started", 0),
            (dict(schedule_date_start=t - timedelta(2), schedule_date_end=t + timedelta(2)), "in_progress", 0),
            (dict(schedule_date_start=t - timedelta(10), schedule_date_end=t - timedelta(4)), "overdue", 4),
        ]
        for vals, status, delay in cases:
            task = self._task(**vals)
            self.assertEqual(task.schedule_status, status, vals)
            self.assertEqual(task.schedule_delay_days, delay, vals)

        task = self._task(schedule_date_start=t - timedelta(10), schedule_date_end=t - timedelta(4))
        self.assertEqual(task.schedule_planned_days, 7)
        self.assertEqual(task.schedule_actual_days, 11)
        task.stage_id = self.stage_done
        task.schedule_date_done = t - timedelta(6)
        self.assertEqual(task.schedule_status, "done_on_time")
        self.assertEqual(task.schedule_delay_days, -2)
        self.assertEqual(task.schedule_actual_days, 5)
        task.schedule_date_done = t - timedelta(1)
        self.assertEqual(task.schedule_status, "done_late")
        self.assertEqual(task.schedule_delay_days, 3)

    def test_view_registration(self):
        info = self.env["ir.ui.view"].get_view_info()
        self.assertIn("plan_timeline", info)
        views = self.env["project.task"].get_views([(False, "plan_timeline"), (False, "search")])
        self.assertIn("plan_timeline", views["views"])
        action = self.env.ref("project.action_view_all_task")
        self.assertIn("plan_timeline", action.view_mode.split(","))
