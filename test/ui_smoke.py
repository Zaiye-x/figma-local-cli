"""Real browser + real HTTP bridge + explicitly simulated Figma host."""
import json
import html
import os
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "ui"
OUT.mkdir(parents=True, exist_ok=True)
credentials = json.loads((ROOT / ".figma-local/session.json").read_text())
pair_code = json.dumps({"version": 1, "url": "http://localhost:3055",
                       "token": credentials["pluginToken"], "instanceId": credentials["instanceId"]})


def cli(*args):
    result = subprocess.run(["node", "src/cli.js", *args], cwd=ROOT,
                            text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise AssertionError(result.stderr)
    return json.loads(result.stdout)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"))
    # Local route fixture only: reproduce Figma's outer-host message through
    # nested frames. No request is sent to figma.com and no login is used.
    nested = browser.new_page()
    inner = '<iframe sandbox="allow-scripts" srcdoc="' + html.escape(
        (ROOT / "plugin/ui.html").read_text(), quote=True) + '"></iframe>'
    inner += "<script>onmessage=e=>parent.postMessage(e.data,'*')</script>"
    host = '<meta charset="utf-8"><iframe srcdoc="' + html.escape(inner, quote=True) + '"></iframe>'
    host += """<script>onmessage=e=>{
      if(e.data.pluginMessage?.type==='context-request')
        frames[0].frames[0].postMessage({pluginMessage:{type:'context',meta:{
          sessionId:'nested-fixture',fileName:'嵌套模拟宿主',pageName:'Fixture',
          pageId:'0:1',selection:[]}}},'*')
    }</script>"""
    nested.route("https://www.figma.com/cli-ui-regression", lambda route:
                 route.fulfill(status=200, content_type="text/html", body=host))
    nested.goto("https://www.figma.com/cli-ui-regression")
    expect(nested.frame_locator("iframe").frame_locator("iframe").locator("#file-name")).to_have_text("嵌套模拟宿主")
    nested.close()
    page = browser.new_page(viewport={"width": 380, "height": 520}, device_scale_factor=2)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("http://127.0.0.1:3912/test/ui-host.html")
    page.wait_for_load_state("networkidle")
    frame = page.frame_locator("iframe")
    expect(frame.locator("#file-name")).to_contain_text("模拟文件")
    page.screenshot(path=str(OUT / "01-disconnected.png"))
    frame.get_by_label("本地连接码").fill('{"version":1}')
    frame.get_by_role("button", name="连接当前文件").click()
    expect(frame.get_by_role("alert")).to_contain_text("连接码格式")
    page.screenshot(path=str(OUT / "02-invalid-code.png"))
    frame.get_by_label("本地连接码").fill(pair_code)
    frame.get_by_role("button", name="连接当前文件").click()
    expect(frame.get_by_role("status")).to_contain_text("已连接到本地 Agent", timeout=10000)
    sessions = cli("sessions")
    assert sessions["sessions"][0]["sessionId"] == "ui-fixture-session"
    cli("bind", "ui-fixture-session")
    result = cli("inspect")
    assert result["mockHost"] is True
    expect(frame.locator("#result")).to_contain_text("已完成", timeout=10000)
    assert frame.get_by_label("本地连接码").input_value() == ""
    page.screenshot(path=str(OUT / "03-connected.png"))
    plugin_frame = page.frames[1]
    dimensions = plugin_frame.evaluate("({scroll:document.body.scrollWidth, width:innerWidth})")
    assert dimensions["scroll"] <= dimensions["width"]
    frame.get_by_role("button", name="折叠面板").click()
    expect(frame.get_by_role("button", name="展开面板")).to_have_attribute("aria-expanded", "false")
    expect(frame.locator("#panel-content")).to_be_hidden()
    expect(frame.get_by_role("status")).to_contain_text("已连接到本地 Agent")
    assert page.locator("iframe").evaluate("element => element.clientHeight") == 104
    collapsed_result = cli("inspect")
    assert collapsed_result["mockHost"] is True
    expect(frame.locator("#result")).to_contain_text("已完成", timeout=10000)
    page.screenshot(path=str(OUT / "04-collapsed.png"))
    frame.get_by_role("button", name="展开面板").click()
    expect(frame.get_by_role("button", name="折叠面板")).to_have_attribute("aria-expanded", "true")
    expect(frame.locator("#panel-content")).to_be_visible()
    assert page.locator("iframe").evaluate("element => element.clientHeight") == 500
    page.wait_for_timeout(200)
    # Test-only theme injection, matching Figma theme variables.
    plugin_frame.add_style_tag(content=""":root {
      --figma-color-text:#f0f0f0;--figma-color-text-secondary:#aaa;
      --figma-color-bg:#252525;--figma-color-border:#444;
      --figma-color-bg-secondary:#333;--figma-color-bg-brand:#1678ed;
    }""")
    page.screenshot(path=str(OUT / "04-dark.png"))
    frame.get_by_role("button", name="断开连接").click()
    expect(frame.get_by_role("status")).to_contain_text("已断开")
    frame.get_by_label("本地连接码").fill(json.dumps({
        "version": 1, "url": "http://localhost:3055", "token": "x" * 43, "instanceId": credentials["instanceId"]}))
    frame.get_by_role("button", name="连接当前文件").click()
    expect(frame.get_by_role("alert")).to_contain_text("认证失败", timeout=10000)
    page.screenshot(path=str(OUT / "05-auth-error.png"))
    assert not errors, errors
    browser.close()
print("PASS: nested host, invalid code, pairing, real bridge/CLI dispatch, collapse/expand, hidden-state polling, result feedback, disconnect, auth error, dark theme, no overflow.")
print("Evidence: artifacts/ui/*.png — simulated Figma host; no real account verification.")
