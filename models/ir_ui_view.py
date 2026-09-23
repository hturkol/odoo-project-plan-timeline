from odoo import fields, models

TIMELINE_VIEW = "plan_timeline"


class IrUiView(models.Model):
    _inherit = "ir.ui.view"

    type = fields.Selection(
        selection_add=[(TIMELINE_VIEW, "Zaman Çizelgesi")],
        ondelete={TIMELINE_VIEW: "cascade"},
    )

    def _get_view_info(self):
        info = super()._get_view_info() if hasattr(super(), "_get_view_info") else {}
        return {**info, TIMELINE_VIEW: {"icon": "fa fa-align-left"}}


class IrActionsActWindowView(models.Model):
    _inherit = "ir.actions.act_window.view"

    view_mode = fields.Selection(
        selection_add=[(TIMELINE_VIEW, "Zaman Çizelgesi")],
        ondelete={TIMELINE_VIEW: "cascade"},
    )
