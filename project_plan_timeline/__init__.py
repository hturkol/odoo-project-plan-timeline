from . import models

TIMELINE_VIEW = "plan_timeline"


def uninstall_hook(env):
    """Görünüm tipini, eklendiği tüm pencere eylemlerinin view_mode alanından temizle."""
    actions = env["ir.actions.act_window"].search([("view_mode", "ilike", TIMELINE_VIEW)])
    for action in actions:
        modes = [mode for mode in action.view_mode.split(",") if mode.strip() != TIMELINE_VIEW]
        action.view_mode = ",".join(modes) or "list,form"
