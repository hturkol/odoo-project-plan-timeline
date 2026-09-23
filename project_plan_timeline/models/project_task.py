from lxml import etree

from odoo import api, fields, models
from odoo.exceptions import ValidationError

TIMELINE_VIEW = "plan_timeline"

# Zaman çizelgesi görünümünün eklendiği standart görev eylemleri
TASK_ACTION_XMLIDS = [
    "project.act_project_project_2_project_task_all",
    "project.action_view_all_task",
    "project.action_view_my_task",
]

SCHEDULE_STATUS = [
    ("no_plan", "Plan Yok"),
    ("not_started", "Başlamadı"),
    ("in_progress", "Devam Ediyor"),
    ("overdue", "Gecikmede"),
    ("done_on_time", "Zamanında Tamamlandı"),
    ("done_late", "Geç Tamamlandı"),
]


class ProjectTask(models.Model):
    _inherit = "project.task"

    schedule_date_start = fields.Date(string="Planlanan Başlangıç", tracking=True)
    schedule_date_end = fields.Date(string="Planlanan Bitiş", tracking=True)
    schedule_actual_start = fields.Date(
        string="Gerçek Başlangıç",
        tracking=True,
        copy=False,
        help="Boş bırakılırsa gerçekleşen süre planlanan başlangıç tarihinden itibaren hesaplanır.",
    )
    schedule_date_done = fields.Date(
        string="Tamamlanma Tarihi",
        compute="_compute_schedule_date_done",
        store=True,
        readonly=False,
        copy=False,
        tracking=True,
        help="Görev tamamlanma aşamasına alındığında otomatik doldurulur, gerekirse elle düzeltilebilir.",
    )
    schedule_planned_days = fields.Integer(string="Planlanan Süre (Gün)", compute="_compute_schedule_metrics")
    schedule_actual_days = fields.Integer(string="Gerçekleşen Süre (Gün)", compute="_compute_schedule_metrics")
    schedule_delay_days = fields.Integer(
        string="Sapma (Gün)",
        compute="_compute_schedule_metrics",
        help="Pozitif: plana göre gecikme, negatif: erken tamamlanma.",
    )
    schedule_status = fields.Selection(SCHEDULE_STATUS, string="Plan Durumu", compute="_compute_schedule_metrics")

    @api.constrains("schedule_date_start", "schedule_date_end")
    def _check_schedule_dates(self):
        for task in self:
            if task.schedule_date_start and task.schedule_date_end and task.schedule_date_end < task.schedule_date_start:
                raise ValidationError(
                    self.env._("Planlanan bitiş tarihi, planlanan başlangıç tarihinden önce olamaz.")
                )

    def _schedule_is_done(self):
        self.ensure_one()
        return bool(self.stage_id.schedule_is_done_stage) or self.state == "1_done"

    @api.depends("stage_id", "state")
    def _compute_schedule_date_done(self):
        today = fields.Date.context_today(self)
        for task in self:
            if not task._schedule_is_done():
                task.schedule_date_done = False
            elif not task.schedule_date_done:
                # Kayıtlı görevde aşama değişim tarihini kullan (kurulumda geçmiş görevler için de doğru tarih)
                if task.id and task.stage_id.schedule_is_done_stage and task.date_last_stage_update:
                    task.schedule_date_done = fields.Date.context_today(task, task.date_last_stage_update)
                else:
                    task.schedule_date_done = today

    @api.depends("schedule_date_start", "schedule_date_end", "schedule_actual_start", "schedule_date_done")
    @api.depends_context("tz")
    def _compute_schedule_metrics(self):
        today = fields.Date.context_today(self)
        for task in self:
            start, end, done = task.schedule_date_start, task.schedule_date_end, task.schedule_date_done
            actual_start = task.schedule_actual_start or start

            planned_days = (end - start).days + 1 if start and end else 0
            actual_days = 0
            if actual_start:
                last_day = done or today
                if last_day >= actual_start:
                    actual_days = (last_day - actual_start).days + 1

            delay = 0
            if not (start and end):
                status = "no_plan"
            elif done:
                delay = (done - end).days
                status = "done_late" if delay > 0 else "done_on_time"
            elif today > end:
                delay = (today - end).days
                status = "overdue"
            elif today < actual_start:
                status = "not_started"
            else:
                status = "in_progress"

            task.schedule_planned_days = planned_days
            task.schedule_actual_days = actual_days
            task.schedule_delay_days = delay
            task.schedule_status = status

    @api.model
    def _get_default_plan_timeline_view(self):
        return etree.fromstring(f"<{TIMELINE_VIEW}/>")

    @api.model
    def plan_timeline_register_view_modes(self):
        """Zaman çizelgesi görünümünü standart görev eylemlerinin görünüm değiştiricisine ekle."""
        for xmlid in TASK_ACTION_XMLIDS:
            action = self.env.ref(xmlid, raise_if_not_found=False)
            if not action or action._name != "ir.actions.act_window":
                continue
            modes = [mode.strip() for mode in (action.view_mode or "").split(",") if mode.strip()]
            if TIMELINE_VIEW not in modes:
                action.view_mode = ",".join(modes + [TIMELINE_VIEW])
        return True
