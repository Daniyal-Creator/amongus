export type ImposterTaskDef = {
  title: string;
  description: string;
  done: boolean;
  lineHint: number;
  expectedPattern: string;
  forbiddenPattern?: string;
  hint: string;
};

export type ImposterTaskResult = {
  index: number;
  title: string;
  lineHint: number;
  done: boolean;
  hint?: string;
};

export type ImposterValidationResult = {
  tasks: ImposterTaskResult[];
  newlyCompleted: number[];
};

function compileSafe(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function evaluateTask(content: string, task: ImposterTaskDef): boolean {
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

export function validateImposterTasks(
  editorContent: string,
  tasks: ImposterTaskDef[],
  previouslyCompleted: number[],
): ImposterValidationResult {
  const completedSet = new Set(previouslyCompleted);
  const results: ImposterTaskResult[] = [];
  const newlyCompleted: number[] = [];

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
    } else {
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
