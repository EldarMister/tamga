from backend.database import get_db
from backend.auth import hash_password


def seed_db():
    db = get_db()

    # Check if already seeded
    if db.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
        db.close()
        return

    # Default director account
    db.execute(
        "INSERT INTO users (username, password_hash, full_name, role, phone) VALUES (?, ?, ?, ?, ?)",
        ("admin", hash_password("admin123"), "Директор", "director", "+996000000000"),
    )

    # 13 services (price list)
    services = [
        ("banner", "Баннер", "Баннер", "banner", "м²", 450, 300, 150, 1, '{"lyuvers": 50}'),
        ("vinyl", "Самоклейка", "Өзү жабышчаак", "vinyl", "м²", 600, 400, 200, 1, "{}"),
        ("mesh", "Сеточная самоклейка", "Тор өзү жабышчаак", "mesh", "м²", 700, 500, 250, 1, "{}"),
        ("table", "Таблички (ПВХ)", "Табличкалар (ПВХ)", "table", "шт", 350, 0, 100, 1, "{}"),
        ("forex", "Стенды Forex", "Forex стенддери", "stand", "м²", 2000, 1800, 800, 1, "{}"),
        ("letters", "Объемные буквы", "Көлөмдүү тамгалар", "letters", "см", 50, 0, 15, 1, '{"calc_by": "height"}'),
        ("plotter", "Плоттерная резка", "Плоттердик кесүү", "plotter", "м²", 1000, 0, 300, 1, "{}"),
        ("dtf", "DTF печать", "DTF басып чыгаруу", "dtf", "шт", 350, 0, 100, 1, '{"artyna_price": 150}'),
        ("menu_a4", "Меню A4", "Меню A4", "menu", "лист", 150, 0, 50, 5, '{"double_lam": 200}'),
        ("vizit_1", "Визитки 1 стор.", "Визитка 1 тарап", "business_card", "шт", 5, 0, 1, 20, "{}"),
        ("vizit_2", "Визитки 2 стор.", "Визитка 2 тарап", "business_card", "шт", 6, 0, 2, 20, "{}"),
        ("photo_a4", "Фото A4", "Сүрөт A4", "photo", "шт", 50, 0, 15, 1, "{}"),
        ("photo_a3", "Фото A3", "Сүрөт A3", "photo", "шт", 150, 0, 40, 1, "{}"),
    ]
    for s in services:
        db.execute(
            """INSERT INTO services (code, name_ru, name_ky, category, unit, price_retail, price_dealer, cost_price, min_order, options)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            s,
        )

    # 5 materials
    materials = [
        ("banner_roll", "Баннерная ткань", "Баннер кездеме", "м²", 0, 10, 50),
        ("vinyl_roll", "Самоклейка", "Өзү жабышчаак", "м²", 0, 10, 50),
        ("mesh_roll", "Сеточная самоклейка", "Тор өзү жабышчаак", "м²", 0, 10, 50),
        ("oracal_roll", "Плоттерная пленка", "Плоттер пленкасы", "м²", 0, 5, 25),
        ("dtf_film", "DTF пленка", "DTF пленка", "м²", 0, 5, 100),
    ]
    for m in materials:
        db.execute(
            """INSERT INTO materials (code, name_ru, name_ky, unit, quantity, low_threshold, roll_size)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            m,
        )

    # Service-to-material mappings
    mappings = [
        ("banner", "banner_roll", 1.0),
        ("vinyl", "vinyl_roll", 1.0),
        ("mesh", "mesh_roll", 1.0),
        ("plotter", "oracal_roll", 1.0),
        ("dtf", "dtf_film", 0.09),  # ~A4 sheet = 0.09 m²
    ]
    for service_code, material_code, ratio in mappings:
        db.execute(
            """INSERT INTO service_material_map (service_id, material_id, ratio)
               SELECT s.id, m.id, ?
               FROM services s, materials m
               WHERE s.code = ? AND m.code = ?""",
            (ratio, service_code, material_code),
        )

    db.commit()
    db.close()
    print("[SEED] Database seeded with default data")
