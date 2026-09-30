"""Render the non-text pieces of the poster as separate transparent PNGs for Canva."""
import build  # noqa: F401  (regenerates out/*.html; we reuse its ICONS/ILLUS/POINTS)
from build import ICONS, ILLUS, POINTS, WORKSHOP_SVG, OUT

A = OUT / "assets"
A.mkdir(exist_ok=True)

def html(body, w, h, extra=""):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{w}px;height:{h}px;background:transparent;overflow:hidden}}{extra}</style></head><body>{body}</body></html>"""

BADGE_CSS = """.badge{position:absolute;left:10px;top:10px;width:120px;height:120px;border-radius:50%;
background:radial-gradient(circle,#1b6a80 0 58%,#2fb4c9 60%,#0e4d5f 100%);display:grid;place-items:center;box-shadow:0 6px 8px rgba(0,0,0,.3)}
.badge::before{content:"";position:absolute;inset:18%;border-radius:50%;background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--c) 60%,#fff),var(--c) 70%);box-shadow:inset 0 -5px 8px rgba(0,0,0,.25)}
.badge svg{position:relative;width:42%;height:42%;filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))}"""

pages = {}
for i, (icon, color, illus, *_rest) in enumerate(POINTS, 1):
    pages[f"badge{i}"] = (html(f'<div class="badge" style="--c:{color}"><svg viewBox="0 0 24 24" fill="#fff">{ICONS[icon]}</svg></div>', 140, 140, BADGE_CSS), 140, 140)
    pages[f"illus{i}"] = (html(f'<svg viewBox="0 0 200 160" width="400" height="320" style="filter:drop-shadow(0 10px 10px rgba(0,0,0,.3))">{ILLUS[illus]}</svg>', 400, 320), 400, 320)

pages["shield"] = (html('<div style="position:absolute;left:8px;top:6px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#5fd08a,#1f8a4c);display:grid;place-items:center;box-shadow:0 6px 10px rgba(18,90,60,.35),inset 0 -6px 10px rgba(0,0,0,.2)"><svg viewBox="0 0 24 24" width="66" height="66" fill="#fff"><path d="M12 1.5 20.5 5v6c0 5.4-3.6 10-8.5 11.5C7.1 21 3.5 16.4 3.5 11V5L12 1.5zm0 6a2.6 2.6 0 0 0-2.6 2.6V11H8.6v6h6.8v-6h-.8v-.9A2.6 2.6 0 0 0 12 7.5zm0 1.4c.66 0 1.2.54 1.2 1.2V11h-2.4v-.9c0-.66.54-1.2 1.2-1.2z"/></svg></div>', 136, 136), 136, 136)

WS = WORKSHOP_SVG.replace("<svg ", '<svg width="1080" height="600" ')
pages["foto-placeholder"] = (html(f'<div style="width:1080px;height:600px;-webkit-mask-image:linear-gradient(180deg,transparent,#000 40%)">{WS}</div>', 1080, 600), 1080, 600)

def bg(w, h):
    s = h
    return html(f"""<div style="position:absolute;inset:0;background:linear-gradient(180deg,#e9f6fd 0%,#b9e0f3 30%,#8fcbea 55%,#d7eef9 100%)"></div>
<div class=c style="width:420px;height:180px;left:-120px;top:{s*.09:.0f}px"></div><div class=c style="width:380px;height:160px;right:-90px;top:{s*.22:.0f}px"></div>
<div class=c style="width:320px;height:130px;left:34%;top:{s*.5:.0f}px;opacity:.5"></div><div class=c style="width:500px;height:160px;left:-160px;top:{s*.72:.0f}px;opacity:.6"></div>
<div class=l style="left:-26px;top:{s*.12:.0f}px;transform:rotate(-30deg)"></div><div class=l style="right:10px;top:{s*.28:.0f}px;transform:rotate(150deg) scale(.7)"></div>
<div class=l style="left:6px;top:{s*.6:.0f}px;transform:rotate(20deg) scale(.8)"></div><div class=l style="right:-20px;top:{s*.78:.0f}px;transform:rotate(200deg) scale(.9)"></div>""",
        w, h, ".c{position:absolute;border-radius:50%;background:#fff;filter:blur(28px);opacity:.85}.l{position:absolute;width:110px;height:48px;border-radius:0 100% 0 100%;background:linear-gradient(135deg,#9be15d,#2e9e4f);filter:blur(1.5px)}")

pages["bg-instagram-post"] = (bg(1080, 1350), 1080, 1350)
pages["bg-story"] = (bg(1080, 1920), 1080, 1920)

for name, (content, w, h) in pages.items():
    (A / f"{name}.html").write_text(content, encoding="utf-8")
print(" ".join(f"{n}:{w}x{h}" for n, (_, w, h) in pages.items()))
