from playwright.sync_api import sync_playwright
import sys
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errores = []
    pg.on("pageerror", lambda e: errores.append(str(e)))
    pg.on("console", lambda m: errores.append(m.text) if m.type == "error" else None)
    pg.goto("http://localhost:8731/index.html", wait_until="networkidle")
    if errores:
        print("ERROR al cargar:", errores[0]); b.close(); sys.exit(1)
    res = pg.evaluate("() => window.correr()")
    b.close()
mal = 0; total = 0
for r in res:
    if r["n"].startswith("   "):
        print(r["n"]); continue
    total += 1
    bien = r["c"]
    if not bien: mal += 1
    detalle = ("  -> " + r["d"]) if (r["d"] and not bien) else ""
    print(f"  {'OK   ' if bien else 'MAL  '} {r['n']}{detalle}")
print(f"\n  {total-mal} bien, {mal} mal")
sys.exit(1 if mal else 0)
