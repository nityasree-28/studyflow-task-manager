"""StudyFlow end-to-end browser tests. Requires Python playwright and Chromium."""
import json
import os
import shutil
from pathlib import Path
import socket
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SHOT = ROOT / 'screenshots'
SHOT.mkdir(exist_ok=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

def start_server():
    server = ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    return server


def test():
    server = start_server()
    url=f'http://127.0.0.1:{server.server_address[1]}/'
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome'), args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 1440, 'height': 1000},device_scale_factor=1,accept_downloads=True)
            page=context.new_page()
            errors=[]
            page.on('pageerror', lambda err: errors.append(str(err)))
            # Enforced sandbox browser policy blocks all URLs. In that case render actual
            # application HTML/CSS/JS in about:blank with a minimal localStorage shim.
            # This still exercises the real UI logic, but not Chrome's disk persistence.
            mocked_storage=False
            try:
                page.goto(url,wait_until='domcontentloaded')
            except Exception as error:
                if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error):
                    raise
                mocked_storage=True
                html=(ROOT/'index.html').read_text()
                css=(ROOT/'styles.css').read_text().replace("@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');",'')
                js=(ROOT/'app.js').read_text()
                shim="const state = new Map(); Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:key=>state.has(key)?state.get(key):null,setItem:(key,v)=>state.set(key,String(v)),removeItem:key=>state.delete(key)}});"
                html=html.replace('<link rel="stylesheet" href="styles.css" />','<style>'+css+'</style>')
                html=html.replace('<script defer src="app.js"></script>','<script>'+shim+'</script><script>'+js+'</script>')
                page.set_content(html,wait_until='domcontentloaded')
                print('NOTE: URL navigation blocked by managed Chromium policy; exercising real UI in about:blank with an in-memory storage shim.')
            page.locator('#statTotal').wait_for()
            page.wait_for_timeout(450)
            assert page.locator('#statTotal').inner_text()=='6', 'first visit should seed 6 demo tasks'
            assert page.locator('#statDone').inner_text()=='2', '2 samples should be complete'
            assert page.locator('#statPending').inner_text()=='4'
            page.screenshot(path=str(SHOT/'dashboard.png'),full_page=True,animations='disabled')
            print('PASS initial dashboard: 6 tasks, 2 completed, 4 pending')

            page.locator('#newTaskTop').click()
            assert page.locator('#taskDialog').is_visible()
            page.screenshot(path=str(SHOT/'new-task.png'),full_page=False,animations='disabled')
            page.locator('#taskTitle').fill('Finish AAT-1 portfolio report')
            page.locator('#taskCourse').fill('Full Stack Development')
            page.locator('#taskDate').fill('2026-10-16')
            page.locator('#taskPriority').select_option('high')
            page.locator('#taskNotes').fill('Add real screenshots and README.')
            page.locator('#submitTask').click()
            assert page.locator('#statTotal').inner_text()=='7'
            assert page.get_by_text('Finish AAT-1 portfolio report').count()==1
            print('PASS create task')

            # Search + priority filter
            page.locator('#searchInput').fill('AAT-1 portfolio')
            assert page.locator('.task-row').count()==1
            page.locator('#priorityFilter').select_option('low')
            assert page.locator('.task-row').count()==0
            page.locator('#priorityFilter').select_option('high')
            assert page.locator('.task-row').count()==1
            print('PASS search and priority filter')

            # Edit existing task
            page.get_by_role('button',name='Edit Finish AAT-1 portfolio report').click()
            page.locator('#taskTitle').fill('Submit AAT-1 portfolio report')
            page.locator('#submitTask').click()
            assert page.get_by_text('Submit AAT-1 portfolio report').count()==1
            print('PASS edit task')

            # Completion and progress
            page.locator('.task-row .task-check').check()
            assert page.locator('#statDone').inner_text()=='3'
            assert page.locator('#statPending').inner_text()=='4'
            print('PASS mark task completed and update dashboard')

            # Persist refresh
            if mocked_storage: page.evaluate('tasks=loadTasks(); render()')
            else: page.reload(wait_until='domcontentloaded')
            assert page.locator('#statTotal').inner_text()=='7'
            assert page.locator('#statDone').inner_text()=='3'
            assert page.get_by_text('Submit AAT-1 portfolio report').count()==1
            print('PASS '+('storage adapter rehydration (in-memory shim)' if mocked_storage else 'real browser localStorage persistence after refresh'))

            # Status filter and clear completed
            page.locator('#searchInput').fill('')
            page.locator('#priorityFilter').select_option('all')
            page.locator('.filter-tab[data-filter="completed"]').click()
            assert page.locator('.task-row').count()==3
            page.get_by_role('button',name='Clear completed').click()
            # Browser's confirm must be handled through listener, do it separately below
            print('PASS completed filter')
            # Current click may already have automatically dismissed confirmation (Playwright default); verify no deletion
            assert page.locator('#statTotal').inner_text()=='7'

            # Delete via confirm
            page.locator('.filter-tab[data-filter="all"]').click()
            page.locator('#searchInput').fill('database assignment')
            page.once('dialog',lambda dialog: dialog.accept())
            page.get_by_role('button',name='Delete Complete database assignment').click()
            assert page.locator('#statTotal').inner_text()=='6'
            print('PASS delete with confirmation')

            # Backup export
            page.locator('#searchInput').fill('')
            with page.expect_download() as dl:
                page.locator('#exportTasks').click()
            download=dl.value
            assert download.suggested_filename.startswith('studyflow-tasks-')
            export_path=SHOT/'test-export.json'
            download.save_as(str(export_path))
            content=json.loads(export_path.read_text())
            assert len(content['tasks'])==6
            export_path.unlink()
            print('PASS JSON task export')

            # Mobile layout
            page.set_viewport_size({'width':390,'height':844})
            if mocked_storage: page.evaluate('tasks=loadTasks(); render()')
            else: page.reload(wait_until='domcontentloaded')
            assert page.locator('#statTotal').inner_text()=='6'
            page.locator('#menuButton').click()
            assert 'open' in page.locator('.sidebar').get_attribute('class')
            page.locator('.nav-item[data-view="upcoming"]').click()
            assert page.locator('#crumbCurrent').inner_text()=='Upcoming'
            page.screenshot(path=str(SHOT/'mobile.png'),full_page=True,animations='disabled')
            print('PASS mobile navigation at 390px')
            assert not errors, f'Unexpected page errors: {errors}'
            print('PASS no uncaught JavaScript errors')
            context.close()
            browser.close()
    finally:
        server.shutdown()

if __name__=='__main__':
    test()
