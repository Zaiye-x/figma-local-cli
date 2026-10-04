"""Browser acceptance of the narrow frontend built from a real smoke handoff."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/real-20261004"
URL = os.environ.get("FRONTEND_SMOKE_URL", "http://127.0.0.1:3913")
snapshot = json.loads((OUT / "handoff/snapshot.json").read_text())
start = next(n for n in snapshot["nodes"] if n["name"] == "01 · Start")
button_node = next(n for n in start["children"] if n["type"] == "INSTANCE")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"))
    page = browser.new_page(viewport={"width": 1000, "height": 700}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_load_state("networkidle")
    page.evaluate("document.fonts.ready")
    assert page.evaluate("document.fonts.check('600 26px Inter')")
    screen = page.locator("#start")
    link = page.get_by_role("link", name="Continue")
    expect(screen).to_be_visible()
    screen.screenshot(path=str(OUT / "web-start.png"))
    metrics = page.evaluate("""() => {
      const s=document.querySelector('#start'), b=s.querySelector('a');
      const r=s.getBoundingClientRect(), br=b.getBoundingClientRect();
      return {screen:{width:r.width,height:r.height},button:{
        x:br.x-r.x,y:br.y-r.y,width:br.width,height:br.height},
        background:getComputedStyle(b).backgroundColor,
        padding:getComputedStyle(s).paddingLeft}
    }""")
    assert metrics["screen"] == {"width": start["width"], "height": start["height"]}
    for dimension in ["x", "y", "height"]:
        assert abs(metrics["button"][dimension] - button_node[dimension]) < 1, metrics
    assert metrics["padding"] == "24px"
    # A pointer action, then history navigation, then an entirely keyboard action.
    link.click()
    expect(page.get_by_role("heading", name="Ready for handoff")).to_be_visible()
    expect(page.get_by_role("heading", name="Ready for handoff")).to_be_focused()
    page.locator("#complete").screenshot(path=str(OUT / "web-complete.png"))
    page.go_back()
    expect(screen).to_be_visible()
    page.keyboard.press("Tab")
    expect(link).to_be_focused()
    page.keyboard.press("Enter")
    expect(page.locator("#complete")).to_be_visible()
    page.reload()
    expect(page.locator("#complete")).to_be_visible()
    mobile = browser.new_page(viewport={"width": 320, "height": 640},
                              is_mobile=True, has_touch=True, device_scale_factor=1)
    mobile.goto(URL)
    mobile.wait_for_load_state("networkidle")
    mobile.evaluate("document.fonts.ready")
    assert mobile.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert mobile.get_by_role("link", name="Continue").bounding_box()["height"] >= 44
    mobile.screenshot(path=str(OUT / "web-mobile-320.png"))
    mobile.get_by_role("link", name="Continue").tap()
    expect(mobile.get_by_role("heading", name="Ready for handoff")).to_be_visible()
    assert not errors, errors
    (OUT / "frontend-verification.json").write_text(json.dumps({
        "source": snapshot["source"], "capturedAt": snapshot["capturedAt"],
        "metrics": metrics, "figmaButton": {k: button_node[k] for k in ["x", "y", "width", "height"]},
        "checks": ["real handoff tokens and component reference", "360x420 frame",
                   "pointer navigation", "keyboard navigation and focus", "browser back",
                   "deep link refresh", "320px no overflow", "44px touch target"],
        "errors": errors
    }, indent=2) + "\n")
    browser.close()
print("PASS: real handoff → frontend; layout, navigation, keyboard, history, mobile and screenshots.")
