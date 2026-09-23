{
    "name": "Proje - Plan / Gerçekleşen Takibi",
    "version": "19.0.1.0.0",
    "category": "Services/Project",
    "summary": "Görevler için planlanan/gerçekleşen tarihler ve plan-gerçek zaman çizelgesi görünümü",
    "description": """
Proje görevlerini plana göre takip etmek için (implementasyon, kurulum, danışmanlık vb.):
- Görevlere planlanan başlangıç / bitiş tarihleri
- Görev tamamlanma aşamasına alındığında otomatik tamamlanma tarihi
- Planlanan ve gerçekleşen süreyi çizgi barlarla gösteren "Zaman Çizelgesi" görünümü
""",
    "author": "",
    "license": "LGPL-3",
    "depends": ["project"],
    "data": [
        "views/project_task_type_views.xml",
        "views/project_task_views.xml",
        "views/plan_timeline_views.xml",
        "data/plan_timeline_data.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "project_plan_timeline/static/src/**/*",
        ],
    },
    "uninstall_hook": "uninstall_hook",
    "installable": True,
    "application": True,
}
