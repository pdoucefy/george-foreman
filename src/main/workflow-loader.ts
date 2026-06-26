import type { Config, Workflow } from '@shared/types';
import { schWorkflowArgument, schWorkflowTask } from '@shared/types';

import { app } from 'electron';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Raw YAML schema — no `source` field (injected at load time, not in YAML)
// ---------------------------------------------------------------------------

const schWorkflowYaml = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  argument: schWorkflowArgument.optional(),
  tasks: z.array(schWorkflowTask).min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isYamlFile = (name: string): boolean => name.endsWith('.yml') || name.endsWith('.yaml');

const detectArgument = (
  explicitArgument: z.infer<typeof schWorkflowArgument> | undefined,
  tasks: z.infer<typeof schWorkflowTask>[],
): z.infer<typeof schWorkflowArgument> => {
  if (explicitArgument !== undefined) return explicitArgument;
  const hasPlaceholder = tasks.some((t) => t.prompt.includes('{{argument}}'));
  return hasPlaceholder ? 'required' : 'none';
};

const loadFile = async (filePath: string, source: Workflow['source']): Promise<Workflow | null> => {
  let content: string;
  try {
    content = (await fs.readFile(filePath, 'utf-8')) as string;
  } catch (err) {
    console.warn(`[workflow-loader] failed to read file: ${filePath}`, err);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (err) {
    console.warn(`[workflow-loader] YAML parse error in ${filePath}:`, err);
    return null;
  }

  const validation = schWorkflowYaml.safeParse(parsed);
  if (!validation.success) {
    console.warn(`[workflow-loader] invalid workflow in ${filePath}:`, validation.error);
    return null;
  }

  const { name, description, argument, tasks } = validation.data;

  return {
    name,
    description,
    argument: detectArgument(argument, tasks),
    tasks,
    source,
  };
};

const loadFromDir = async (dir: string, source: Workflow['source']): Promise<Workflow[]> => {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    const { code } = err as NodeJS.ErrnoException;
    if (code === 'ENOENT') {
      console.warn(`[workflow-loader] directory not found: ${dir}`);
      return [];
    }
    throw err;
  }

  const yamlFiles = entries
    .filter((entry) => entry.isFile() && isYamlFile(entry.name))
    .map((entry) => path.join(dir, entry.name));

  const results = await Promise.all(yamlFiles.map((filePath) => loadFile(filePath, source)));

  return results.filter((w): w is Workflow => w !== null);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const loadWorkflows = async (params: {
  repoPath: string;
  config: Config;
}): Promise<Workflow[]> => {
  const { repoPath, config } = params;

  const repoWorkflowsDir = path.join(repoPath, '.george-foreman', 'workflows');
  const userWorkflowsDir = config.userWorkflowsFolder;
  const builtinWorkflowsDir = path.join(app.getAppPath(), 'workflows');

  const [repoWorkflows, userWorkflows, builtinWorkflows] = await Promise.all([
    loadFromDir(repoWorkflowsDir, 'repo'),
    userWorkflowsDir !== null ? loadFromDir(userWorkflowsDir, 'user') : Promise.resolve([]),
    loadFromDir(builtinWorkflowsDir, 'builtin'),
  ]);

  return [...repoWorkflows, ...userWorkflows, ...builtinWorkflows];
};
