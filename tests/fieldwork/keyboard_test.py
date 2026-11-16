"""Run with python keyboard_test.py path/to/Athena-Source-Explorer.html (requires Playwright)."""
import os
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def check_explorer(page, file_url, language):
    page.goto(file_url + '#/fieldwork/aeronet')
    page.locator('#' + language).click()
    skip = page.locator('.fw-skip')
    skip.focus()
    expect(skip).to_be_visible()
    page.keyboard.press('Enter')
    expect(page.locator('#fw-investigation')).to_be_focused()
    assert page.url.endswith('#/fieldwork/aeronet')
    page.keyboard.press('Tab')
    expect(page.locator('.fw-legend input').first).to_be_focused()

    previous, following = page.locator('.fw-page button').all()
    for trigger, reverse in [(following, previous), (previous, following)]:
        trigger.focus()
        page.keyboard.press('Enter')
        page.keyboard.press('Enter')
        expect(trigger).to_be_disabled()
        expect(reverse).to_be_focused()

    page.locator('a[href="#/fieldwork/drought"]').click()
    periods = page.locator('.fw-drought-select')
    previous, following = page.locator('.fw-drought-actions').first.locator('button').all()
    for offset, trigger, reverse in [(1, previous, following), (34, following, previous)]:
        periods.select_option(index=offset)
        trigger.focus()
        page.keyboard.press('Enter')
        expect(trigger).to_be_disabled()
        expect(reverse).to_be_focused()


if __name__ == '__main__':
    url = Path(sys.argv[1]).resolve().as_uri()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH'))
        for lang, width in [('en', 1280), ('el', 320)]:
            page = browser.new_page(viewport={'width': width, 'height': 800})
            check_explorer(page, url, lang)
            page.close()
            print(f'{lang} keyboard checks passed at {width}px')
        browser.close()
