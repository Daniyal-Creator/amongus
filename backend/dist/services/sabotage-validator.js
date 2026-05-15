function compileSafe(pattern) {
    try {
        return new RegExp(pattern);
    }
    catch {
        return null;
    }
}
function evaluateTask(content, task) {
    const expected = compileSafe(task.expectedPattern);
    if (!expected || !expected.test(content)) {
        return false;
    }
    if (task.forbiddenPattern) {
        const forbidden = compileSafe(task.forbiddenPattern);
        if (forbidden && forbidden.test(content)) {
            return false;
        }
    }
    return true;
}
export function validateImposterTasks(editorContent, tasks, previouslyCompleted) {
    const completedSet = new Set(previouslyCompleted);
    const results = [];
    const newlyCompleted = [];
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (completedSet.has(i)) {
            results.push({
                index: i,
                title: task.title,
                lineHint: task.lineHint,
                done: true,
            });
            continue;
        }
        const done = evaluateTask(editorContent, task);
        if (done) {
            newlyCompleted.push(i);
            results.push({
                index: i,
                title: task.title,
                lineHint: task.lineHint,
                done: true,
            });
        }
        else {
            results.push({
                index: i,
                title: task.title,
                lineHint: task.lineHint,
                done: false,
                hint: task.hint,
            });
        }
    }
    return { tasks: results, newlyCompleted };
}
