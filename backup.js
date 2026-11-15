'use strict';
/**
 * AI-assisted AAT-2 enhancement: validate JSON task backups before importing.
 * This function is deliberately pure so it can be tested in Node and the browser.
 */
(function(root) {
  function validateBackup(raw) {
    if (typeof raw !== 'string' || raw.length > 1024 * 1024) {
      throw new Error('Choose a JSON backup smaller than 1 MB.');
    }
    let backup;
    try { backup = JSON.parse(raw); }
    catch { throw new Error('This file is not valid JSON.'); }
    if (!backup || backup.app !== 'StudyFlow' || !Array.isArray(backup.tasks)) {
      throw new Error('This is not a StudyFlow task backup.');
    }
    if (backup.tasks.length > 500) throw new Error('A backup can contain at most 500 tasks.');
    const seen = new Set();
    const tasks = backup.tasks.map((task, index) => {
      const label = `Task ${index + 1}`;
      if (!task || typeof task !== 'object' || Array.isArray(task)) {
        throw new Error(`${label} is not a task object.`);
      }
      const id = task.id, title = task.title, course = task.course,
        due = task.due, priority = task.priority, done = task.done;
      if (typeof id !== 'string' || !id.trim() || id.length > 100 || seen.has(id)) {
        throw new Error(`${label} has a missing or duplicate identifier.`);
      }
      seen.add(id);
      if (typeof title !== 'string' || !title.trim() || title.length > 100) {
        throw new Error(`${label} needs a title of 1-100 characters.`);
      }
      if (typeof course !== 'string' || !course.trim() || course.length > 60) {
        throw new Error(`${label} needs a subject of 1-60 characters.`);
      }
      if (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
        throw new Error(`${label} has an invalid due date.`);
      }
      const date = new Date(`${due}T12:00:00`);
      if (Number.isNaN(date.getTime()) ||
        `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` !== due) {
        throw new Error(`${label} has an impossible date.`);
      }
      if (!['high', 'medium', 'low'].includes(priority) || typeof done !== 'boolean') {
        throw new Error(`${label} has an invalid priority or completion state.`);
      }
      if (task.notes != null && (typeof task.notes !== 'string' || task.notes.length > 300)) {
        throw new Error(`${label} has invalid notes.`);
      }
      return { id, title: title.trim(), course: course.trim(), due, priority, done,
        notes: (task.notes || '').trim() };
    });
    return tasks;
  }
  root.StudyFlowBackup = { validateBackup };
  if (typeof module !== 'undefined' && module.exports) module.exports = { validateBackup };
})(typeof window !== 'undefined' ? window : globalThis);
