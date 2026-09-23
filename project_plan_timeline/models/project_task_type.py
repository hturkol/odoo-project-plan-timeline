from odoo import api, fields, models


class ProjectTaskType(models.Model):
    _inherit = "project.task.type"

    schedule_is_done_stage = fields.Boolean(
        string="Tamamlanma Aşaması",
        compute="_compute_schedule_is_done_stage",
        store=True,
        readonly=False,
        help="Bu aşamaya alınan görevler tamamlanmış sayılır ve tamamlanma tarihi otomatik yazılır. "
        "Varsayılan olarak 'Kanban'da Katlanmış' aşamalar tamamlanma aşamasıdır.",
    )

    @api.depends("fold")
    def _compute_schedule_is_done_stage(self):
        for stage in self:
            stage.schedule_is_done_stage = stage.fold
