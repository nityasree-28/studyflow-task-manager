'use strict';
// StudyFlow: local, dependency-free student task manager.
const STORAGE_KEY = 'studyflow.tasks.v1';
const $ = (id) => document.getElementById(id);
const addDays = (days) => { const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const dateLocal = (iso) => new Date(`${iso}T12:00:00`);
const nowISO = () => addDays(0);
const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const demoTasks = () => [
  {title:'Complete database assignment',course:'Database Management',due:addDays(1),priority:'high',done:false,notes:'Finish normalization questions and SQL practice.'},
  {title:'Prepare project demonstration',course:'Full Stack Development',due:addDays(3),priority:'high',done:false,notes:'Check all features and prepare a brief walkthrough.'},
  {title:'Revise data structures',course:'Data Structures',due:addDays(5),priority:'medium',done:false,notes:'Trees and graph traversal.'},
  {title:'Review software testing notes',course:'Software Testing',due:addDays(0),priority:'medium',done:false,notes:'Practice boundary value analysis.'},
  {title:'Submit programming lab work',course:'Programming Laboratory',due:addDays(-1),priority:'low',done:true,notes:''},
  {title:'Organize lecture notes',course:'Computer Networks',due:addDays(2),priority:'low',done:true,notes:''}
].map(t=>({...t,id:createId()}));

function loadTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) { const seed=demoTasks(); localStorage.setItem(STORAGE_KEY,JSON.stringify(seed)); return seed; }
    const parsed=JSON.parse(stored);
    if (!Array.isArray(parsed)) throw Error('Invalid saved tasks');
    return parsed.filter(t=>typeof t.id==='string' && typeof t.title==='string' && typeof t.course==='string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due) && ['high','medium','low'].includes(t.priority) && typeof t.done==='boolean');
  } catch (error) { console.warn('StudyFlow could not read saved tasks:',error); showToast('Saved tasks could not be loaded. Starting with an empty list.'); return []; }
}
let tasks=[];
let currentView='dashboard';
let activeFilter='all';
let editingId=null;
let toastTimer;

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch (error) {
    console.warn('StudyFlow could not save tasks:', error);
    showToast('Unable to save. Check browser storage permissions.');
    return false;
  }
}
function showToast(message){const el=$('toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3000);}
function isOverdue(task){return !task.done && task.due<nowISO();}
function dateLabel(iso){const diff=Math.round((dateLocal(iso)-dateLocal(nowISO()))/86400000);if(diff===0)return 'Today';if(diff===1)return 'Tomorrow';if(diff===-1)return 'Yesterday';return dateLocal(iso).toLocaleDateString(undefined,{month:'short',day:'numeric'});}
function getFilteredTasks() {
  const search = $('searchInput').value.trim().toLocaleLowerCase();
  const priority = $('priorityFilter').value;
  const filter = currentView === 'completed' ? 'completed'
    : currentView === 'upcoming' ? 'upcoming' : activeFilter;

  return tasks.filter((task) => {
    if (priority !== 'all' && task.priority !== priority) return false;
    const fields = `${task.title} ${task.course} ${task.notes || ''}`;
    if (search && !fields.toLocaleLowerCase().includes(search)) return false;
    if (filter === 'today') return !task.done && task.due === nowISO();
    if (filter === 'upcoming') return !task.done && task.due >= nowISO();
    if (filter === 'completed') return task.done;
    return true;
  }).sort((a, b) => Number(a.done) - Number(b.done)
    || a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
}
function makeText(tag,className,value){const el=document.createElement(tag);if(className)el.className=className;el.textContent=value;return el;}
function renderTask(task){
 const row=document.createElement('article');row.className='task-row';row.dataset.id=task.id;
 const check=document.createElement('input');check.type='checkbox';check.className='task-check';check.checked=task.done;check.setAttribute('aria-label',`Mark ${task.title} as ${task.done?'pending':'completed'}`);check.addEventListener('change',()=>toggleTask(task.id));row.append(check);
 const body=makeText('div','task-main','');body.append(makeText('div',`task-title${task.done?' done':''}`,task.title));
 const meta=makeText('div','task-meta','');meta.append(makeText('span','task-course',task.course));meta.append(makeText('span','meta-divider',''));meta.append(makeText('span','',`◷ ${dateLabel(task.due)}`));body.append(meta);row.append(body);
 const priority=makeText('span',`priority-pill priority-${task.priority}`,task.priority[0].toUpperCase()+task.priority.slice(1));row.append(priority);
 const due=makeText('span',`due-pill${isOverdue(task)?' overdue':''}`,isOverdue(task)?'Overdue':task.done?'Done':dateLabel(task.due));row.append(due);
 const actions=makeText('div','row-actions','');const edit=makeText('button','icon-button','✎');edit.type='button';edit.title=`Edit ${task.title}`;edit.setAttribute('aria-label',edit.title);edit.addEventListener('click',()=>openTaskModal(task.id));actions.append(edit);
 const del=makeText('button','icon-button delete','×');del.type='button';del.title=`Delete ${task.title}`;del.setAttribute('aria-label',del.title);del.addEventListener('click',()=>deleteTask(task.id));actions.append(del);row.append(actions);return row;
}
function render(){
 const total=tasks.length, done=tasks.filter(t=>t.done).length, pending=total-done, overdue=tasks.filter(isOverdue).length;
 $('statTotal').textContent=total;$('statDone').textContent=done;$('statPending').textContent=pending;$('statOverdue').textContent=overdue;$('sideAllCount').textContent=total;
 const percent=total?Math.round(done/total*100):0;$('progressPercent').textContent=`${percent}%`;$('progressRing').style.setProperty('--progress',`${percent}%`);$('miniCompleted').textContent=done;$('miniPending').textContent=pending;
 $('progressMessage').textContent=percent===100&&total?'Amazing! All tasks are complete.':percent>=50?'Great work! Keep your streak going.':percent>0?'Every little step gets you closer.':'A fresh start! Let’s get things done.';
 const results=getFilteredTasks();$('visibleCount').textContent=`${results.length} ${results.length===1?'task':'tasks'}`;
 const list=$('taskList');list.replaceChildren();if(!results.length){const empty=makeText('div','empty-state','');empty.append(makeText('span','empty-state-icon','☁'));empty.append(makeText('strong','',tasks.length?'No matching tasks':'Your study space is ready'));empty.append(makeText('p','',tasks.length?'Try another filter or search term.':'Add your first task to get started.'));list.append(empty);}else results.forEach(t=>list.append(renderTask(t)));
 $('clearCompleted').disabled=done===0;$('clearCompleted').style.opacity=done?1:.45;
 document.querySelectorAll('.filter-tab').forEach(b=>{const selected=b.dataset.filter===activeFilter;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
 document.querySelectorAll('.nav-item').forEach(b=>{const selected=b.dataset.view===currentView;b.classList.toggle('active',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
}
function toggleTask(id){const t=tasks.find(x=>x.id===id);if(!t)return;t.done=!t.done;saveTasks();render();showToast(t.done?'Task completed. Nicely done!':'Task moved back to pending.');}
function deleteTask(id){const t=tasks.find(x=>x.id===id);if(!t)return;if(!confirm(`Delete "${t.title}"? This cannot be undone.`))return;tasks=tasks.filter(x=>x.id!==id);saveTasks();render();showToast('Task deleted.');}
function openTaskModal(id=null){editingId=id;const t=tasks.find(x=>x.id===id);$('taskForm').reset();$('formError').textContent='';$('dialogTitle').textContent=t?'Edit task':'Create a task';$('submitTask').textContent=t?'Save changes':'Create task';$('taskTitle').value=t?.title??'';$('taskCourse').value=t?.course??'';$('taskDate').value=t?.due??addDays(1);$('taskPriority').value=t?.priority??'medium';$('taskNotes').value=t?.notes??'';$('taskDialog').showModal();$('taskTitle').focus();}
function submitTask(e){e.preventDefault();const title=$('taskTitle').value.trim(),course=$('taskCourse').value.trim(),due=$('taskDate').value,priority=$('taskPriority').value,notes=$('taskNotes').value.trim();if(!title||!course||!/^\d{4}-\d{2}-\d{2}$/.test(due)){$('formError').textContent='Please enter a title, subject, and valid due date.';return;}
 if(!['high','medium','low'].includes(priority)){$('formError').textContent='Please choose a valid priority.';return;}
 if(editingId){const t=tasks.find(x=>x.id===editingId);if(!t)return;Object.assign(t,{title,course,due,priority,notes});}else tasks.push({id:createId(),title,course,due,priority,notes,done:false});
 saveTasks();$('taskDialog').close();render();showToast(editingId?'Task updated successfully.':'New task added successfully.');editingId=null;
}
function setView(view){currentView=view;activeFilter=view==='completed'?'completed':view==='upcoming'?'upcoming':'all';const name={dashboard:'Dashboard',all:'All tasks',upcoming:'Upcoming',completed:'Completed'}[view];$('crumbCurrent').textContent=name;$('mainTitle').textContent=view==='dashboard'?'Overview':name;$('taskSectionTitle').textContent=view==='dashboard'?'Your tasks':name;$('filterTabs').hidden=view==='completed'||view==='upcoming';$('mainSubtitle').textContent=view==='completed'?'Celebrate what you have accomplished.':view==='upcoming'?'Stay ahead of your next deadlines.':'Stay organized, stay focused, and make every deadline count.';$('mainTitle').append(makeText('span','wave',' ✦'));$('mainNav').closest('.sidebar').classList.remove('open');render();}
function exportTasks(){const blob=new Blob([JSON.stringify({app:'StudyFlow',exportedAt:new Date().toISOString(),tasks},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`studyflow-tasks-${nowISO()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);showToast('Backup downloaded successfully.');}
function init(){tasks=loadTasks();$('todayDate').textContent=new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});$('newTaskTop').addEventListener('click',()=>openTaskModal());$('newTaskHero').addEventListener('click',()=>openTaskModal());$('closeDialog').addEventListener('click',()=>$('taskDialog').close());$('cancelDialog').addEventListener('click',()=>$('taskDialog').close());$('taskForm').addEventListener('submit',submitTask);$('searchInput').addEventListener('input',render);$('priorityFilter').addEventListener('change',render);$('filterTabs').addEventListener('click',e=>{const btn=e.target.closest('[data-filter]');if(!btn)return;activeFilter=btn.dataset.filter;render();});$('mainNav').addEventListener('click',e=>{const btn=e.target.closest('[data-view]');if(btn)setView(btn.dataset.view);});$('homeLink').addEventListener('click',e=>{e.preventDefault();setView('dashboard');});$('menuButton').addEventListener('click',()=>$('mainNav').closest('.sidebar').classList.toggle('open'));$('clearCompleted').addEventListener('click',()=>{const count=tasks.filter(t=>t.done).length;if(count&&confirm(`Remove ${count} completed ${count===1?'task':'tasks'}?`)){tasks=tasks.filter(t=>!t.done);saveTasks();render();showToast('Completed tasks cleared.');}});$('exportTasks').addEventListener('click',exportTasks);render();}
document.addEventListener('DOMContentLoaded',init);
