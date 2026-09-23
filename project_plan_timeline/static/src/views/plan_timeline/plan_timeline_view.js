/** @odoo-module **/

import { Component, onWillStart, onWillUpdateProps, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Layout } from "@web/search/layout";
import { SearchBar } from "@web/search/search_bar/search_bar";
import { useSearchBarToggler } from "@web/search/search_bar/search_bar_toggler";

const DAY_MS = 86400000;
const RECORD_LIMIT = 2000;
// "Sığdır" modunda eksen etiket yoğunluğunu hesaplamak için tahmini grafik genişliği (px)
const FIT_WIDTH = 1000;

const SCALES = [
    { key: "fit", label: _t("Sığdır"), pxPerDay: null },
    { key: "day", label: _t("Gün"), pxPerDay: 36 },
    { key: "week", label: _t("Hafta"), pxPerDay: 14 },
    { key: "month", label: _t("Ay"), pxPerDay: 4 },
];

const STATUS_META = {
    no_plan: { label: _t("Plan Yok"), badge: "text-bg-light" },
    not_started: { label: _t("Başlamadı"), badge: "text-bg-secondary" },
    in_progress: { label: _t("Devam Ediyor"), badge: "text-bg-info" },
    overdue: { label: _t("Gecikmede"), badge: "text-bg-danger" },
    done_on_time: { label: _t("Zamanında Tamamlandı"), badge: "text-bg-success" },
    done_late: { label: _t("Geç Tamamlandı"), badge: "text-bg-warning" },
};

const SPECIFICATION = {
    display_name: {},
    project_id: { fields: { display_name: {} } },
    stage_id: { fields: { display_name: {} } },
    user_ids: { fields: { display_name: {} } },
    schedule_date_start: {},
    schedule_date_end: {},
    schedule_actual_start: {},
    schedule_date_done: {},
    schedule_planned_days: {},
    schedule_actual_days: {},
    schedule_delay_days: {},
    schedule_status: {},
};

/** "YYYY-MM-DD" -> UTC gün numarası (tam sayı) */
function toDay(value) {
    if (!value) {
        return null;
    }
    const [y, m, d] = value.split(" ")[0].split("-").map(Number);
    return Date.UTC(y, m - 1, d) / DAY_MS;
}

function todayDay() {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
}

function dayToDate(day) {
    return new Date(day * DAY_MS);
}

function makeFormatter(locale, options) {
    try {
        return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
    } catch {
        return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" });
    }
}

export class PlanTimelineController extends Component {
    static template = "project_plan_timeline.PlanTimelineView";
    static components = { Layout, SearchBar };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.actionService = useService("action");
        this.searchBarToggler = useSearchBarToggler();
        this.scales = SCALES;

        const locale = document.documentElement.getAttribute("lang") || undefined;
        this.fmt = {
            date: makeFormatter(locale, { day: "2-digit", month: "2-digit", year: "numeric" }),
            dayMonth: makeFormatter(locale, { day: "numeric", month: "short" }),
            day: makeFormatter(locale, { day: "numeric" }),
            month: makeFormatter(locale, { month: "short", year: "numeric" }),
        };

        this.records = [];
        this.state = useState({
            loaded: false,
            total: 0,
            scale: "fit",
            groupByProject: true,
            showUndated: false,
        });

        onWillStart(() => this.load(this.props));
        onWillUpdateProps((nextProps) => this.load(nextProps));
    }

    async load(props) {
        const { length, records } = await this.orm.webSearchRead(props.resModel, props.domain, {
            specification: SPECIFICATION,
            context: props.context,
            order: "schedule_date_start, id",
            limit: RECORD_LIMIT,
        });
        this.records = records;
        this.state.total = length;
        this.state.loaded = true;
    }

    // ------------------------------------------------------------------
    // Eylemler
    // ------------------------------------------------------------------

    setScale(key) {
        this.state.scale = key;
    }

    onToggleGroup(ev) {
        this.state.groupByProject = ev.target.checked;
    }

    onToggleUndated(ev) {
        this.state.showUndated = ev.target.checked;
    }

    openTask(resId) {
        const resIds = this.records.map((r) => r.id);
        if (this.props.selectRecord) {
            return this.props.selectRecord(resId, { activeIds: resIds });
        }
        return this.actionService.switchView("form", { resId, resIds });
    }

    // ------------------------------------------------------------------
    // Zaman çizelgesi hesaplama
    // ------------------------------------------------------------------

    formatDate(day) {
        return day === null ? "" : this.fmt.date.format(dayToDate(day));
    }

    prepareItem(rec, today) {
        const start = toDay(rec.schedule_date_start);
        const end = toDay(rec.schedule_date_end);
        const actualStart = toDay(rec.schedule_actual_start) ?? start;
        const done = toDay(rec.schedule_date_done);
        let actualEnd = null;
        if (actualStart !== null) {
            const last = done ?? today;
            if (last >= actualStart) {
                actualEnd = last;
            }
        }
        return {
            rec,
            start,
            end,
            actualStart,
            actualEnd,
            done,
            hasPlan: start !== null && end !== null,
        };
    }

    delayInfo(item, today) {
        const rec = item.rec;
        const delay = rec.schedule_delay_days;
        switch (rec.schedule_status) {
            case "done_late":
                return { text: _t("+%s gün geç", delay), cls: "text-danger" };
            case "done_on_time":
                return delay < 0
                    ? { text: _t("%s gün erken", -delay), cls: "text-success" }
                    : { text: _t("Planında"), cls: "text-success" };
            case "overdue":
                return { text: _t("%s gün gecikme", delay), cls: "text-danger fw-semibold" };
            case "in_progress":
                return { text: _t("%s gün kaldı", item.end - today + 1), cls: "text-muted" };
            case "not_started":
                return { text: _t("%s gün sonra başlıyor", item.start - today), cls: "text-muted" };
            default:
                return { text: "", cls: "" };
        }
    }

    prepareRow(item, bar, today) {
        const rec = item.rec;
        const meta = STATUS_META[rec.schedule_status] || STATUS_META.no_plan;
        const plannedText = item.hasPlan
            ? `${this.formatDate(item.start)} → ${this.formatDate(item.end)}`
            : "";
        const actualText =
            item.actualEnd !== null
                ? `${this.formatDate(item.actualStart)} → ${
                      item.done !== null ? this.formatDate(item.done) : _t("devam")
                  }`
                : "";

        const row = {
            id: rec.id,
            name: rec.display_name,
            projectId: rec.project_id ? rec.project_id.id : 0,
            projectName: rec.project_id ? rec.project_id.display_name : "",
            stageName: rec.stage_id ? rec.stage_id.display_name : "",
            users: (rec.user_ids || []).map((u) => u.display_name).join(", "),
            hasPlan: item.hasPlan,
            plannedText,
            plannedDays: rec.schedule_planned_days,
            actualText,
            actualDays: rec.schedule_actual_days,
            statusLabel: meta.label,
            badgeClass: meta.badge,
            delay: this.delayInfo(item, today),
            planned: null,
            actual: [],
            sortKey: item.start ?? item.actualStart ?? Number.MAX_SAFE_INTEGER,
        };

        if (item.hasPlan) {
            row.planned = {
                style: bar(item.start, item.end),
                title: _t("Plan: %(range)s (%(days)s gün)", {
                    range: plannedText,
                    days: rec.schedule_planned_days,
                }),
            };
        }

        if (item.actualEnd !== null) {
            const isDone = item.done !== null;
            const baseCls = isDone ? "o_pt_bar_done" : "o_pt_bar_progress";
            const title = _t("Gerçekleşen: %(range)s (%(days)s gün)", {
                range: actualText,
                days: rec.schedule_actual_days,
            });
            if (item.hasPlan && item.actualEnd > item.end) {
                // Plan içinde kalan kısım + plan dışına taşan (gecikme) kısmı
                if (item.actualStart <= item.end) {
                    row.actual.push({ cls: baseCls, style: bar(item.actualStart, item.end), title });
                }
                row.actual.push({
                    cls: "o_pt_bar_over" + (isDone ? "" : " o_pt_bar_striped"),
                    style: bar(Math.max(item.actualStart, item.end + 1), item.actualEnd),
                    title: title + " — " + row.delay.text,
                });
            } else {
                row.actual.push({ cls: baseCls, style: bar(item.actualStart, item.actualEnd), title });
            }
        }
        return row;
    }

    buildTicks(rangeStart, rangeEnd, pxPerDay, pct) {
        const ticks = [];
        let unit = "quarter";
        if (pxPerDay >= 24) {
            unit = "day";
        } else if (pxPerDay >= 5) {
            unit = "week";
        } else if (pxPerDay >= 1.2) {
            unit = "month";
        }

        if (unit === "day" || unit === "week") {
            let d = rangeStart;
            if (unit === "week") {
                d += (8 - dayToDate(d).getUTCDay()) % 7; // ilk pazartesi
            }
            const step = unit === "day" ? 1 : 7;
            for (; d < rangeEnd; d += step) {
                const date = dayToDate(d);
                const firstOfMonth = date.getUTCDate() === 1;
                let label = this.fmt.dayMonth.format(date);
                if (unit === "day" && !firstOfMonth && d !== rangeStart) {
                    label = this.fmt.day.format(date);
                }
                ticks.push({
                    key: d,
                    label,
                    major: firstOfMonth || (unit === "day" && date.getUTCDay() === 1),
                    style: `left:${pct(d)}%;`,
                });
            }
        } else {
            const first = dayToDate(rangeStart);
            const year = first.getUTCFullYear();
            let month = first.getUTCMonth();
            const step = unit === "month" ? 1 : 3;
            if (unit === "quarter") {
                month -= month % 3;
            }
            for (;;) {
                const d = Date.UTC(year, month, 1) / DAY_MS;
                if (d >= rangeEnd) {
                    break;
                }
                if (d >= rangeStart) {
                    const date = dayToDate(d);
                    ticks.push({
                        key: d,
                        label: this.fmt.month.format(date),
                        major: date.getUTCMonth() === 0,
                        style: `left:${pct(d)}%;`,
                    });
                }
                month += step;
            }
        }
        return ticks;
    }

    buildSummary(items) {
        const summary = {
            total: 0,
            done_on_time: 0,
            done_late: 0,
            in_progress: 0,
            overdue: 0,
            not_started: 0,
            plannedDays: 0,
            actualDays: 0,
            onTimeRate: null,
            avgDelay: null,
        };
        let doneDelaySum = 0;
        for (const item of items) {
            if (!item.hasPlan) {
                continue;
            }
            const rec = item.rec;
            summary.total++;
            summary[rec.schedule_status] = (summary[rec.schedule_status] || 0) + 1;
            summary.plannedDays += rec.schedule_planned_days;
            summary.actualDays += rec.schedule_actual_days;
            if (rec.schedule_status === "done_on_time" || rec.schedule_status === "done_late") {
                doneDelaySum += rec.schedule_delay_days;
            }
        }
        const done = summary.done_on_time + summary.done_late;
        if (done) {
            summary.onTimeRate = Math.round((summary.done_on_time / done) * 100);
            summary.avgDelay = Math.round((doneDelaySum / done) * 10) / 10;
        }
        summary.done = done;
        return summary;
    }

    getTimeline() {
        const today = todayDay();
        const items = this.records.map((rec) => this.prepareItem(rec, today));
        const datedItems = items.filter((item) => item.hasPlan || item.actualEnd !== null);
        const visibleItems = this.state.showUndated ? items : datedItems;

        // Eksen aralığı
        let min = Infinity;
        let max = -Infinity;
        for (const item of datedItems) {
            for (const d of [item.start, item.end, item.actualStart, item.actualEnd]) {
                if (d !== null) {
                    min = Math.min(min, d);
                    max = Math.max(max, d);
                }
            }
        }
        if (min === Infinity) {
            min = today - 14;
            max = today + 14;
        }
        const pad = Math.max(2, Math.round((max - min + 1) * 0.03));
        const rangeStart = min - pad;
        const rangeEnd = max + pad + 1;
        const totalDays = rangeEnd - rangeStart;

        const scale = SCALES.find((s) => s.key === this.state.scale) || SCALES[0];
        const pxPerDay = scale.pxPerDay || FIT_WIDTH / totalDays;
        const pct = (d) => ((d - rangeStart) / totalDays) * 100;
        const bar = (from, to) =>
            `left:${pct(from)}%;width:${Math.max(pct(to + 1) - pct(from), 0.3)}%;`;

        const rows = visibleItems.map((item) => this.prepareRow(item, bar, today));

        let groups;
        if (this.state.groupByProject) {
            const byProject = new Map();
            for (const row of rows) {
                if (!byProject.has(row.projectId)) {
                    byProject.set(row.projectId, {
                        key: row.projectId,
                        name: row.projectName || _t("Projesiz"),
                        rows: [],
                    });
                }
                byProject.get(row.projectId).rows.push(row);
            }
            groups = [...byProject.values()];
            const byKey = new Map(items.map((item) => [item.rec.id, item]));
            for (const group of groups) {
                const groupItems = group.rows.map((r) => byKey.get(r.id)).filter((i) => i.hasPlan);
                const done = groupItems.filter((i) => i.done !== null).length;
                group.info = _t("%(done)s / %(total)s tamamlandı", {
                    done,
                    total: groupItems.length,
                });
                group.sortKey = Math.min(...group.rows.map((r) => r.sortKey));
                group.span = null;
                if (groupItems.length) {
                    const gStart = Math.min(...groupItems.map((i) => i.start));
                    const gEnd = Math.max(...groupItems.map((i) => i.end));
                    group.span = {
                        style: bar(gStart, gEnd),
                        title: `${this.formatDate(gStart)} → ${this.formatDate(gEnd)}`,
                    };
                }
            }
            groups.sort((a, b) => a.sortKey - b.sortKey);
        } else {
            groups = [{ key: "all", name: null, rows }];
        }

        const chartColumn = scale.pxPerDay
            ? `minmax(${Math.max(Math.round(totalDays * scale.pxPerDay), 480)}px, 1fr)`
            : "minmax(480px, 1fr)";

        return {
            groups,
            rowCount: rows.length,
            undatedCount: items.length - datedItems.length,
            ticks: this.buildTicks(rangeStart, rangeEnd, pxPerDay, pct),
            todayStyle: today >= rangeStart && today < rangeEnd ? `left:${pct(today + 0.5)}%;` : null,
            tableStyle: `--pt-tl-chart: ${chartColumn};`,
            summary: this.buildSummary(items),
        };
    }
}

export const planTimelineView = {
    type: "plan_timeline",
    display_name: _t("Zaman Çizelgesi"),
    icon: "fa fa-align-left",
    multiRecord: true,
    searchMenuTypes: ["filter", "favorite"],
    Controller: PlanTimelineController,
    props: (genericProps) => ({ ...genericProps }),
};

registry.category("views").add("plan_timeline", planTimelineView);
