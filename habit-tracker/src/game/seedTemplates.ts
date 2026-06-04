import { TEMPLATE_CATEGORIES, TemplateTask } from '../constants';

export function buildTemplateTasks(selectedKeys: string[]): TemplateTask[] {
  return TEMPLATE_CATEGORIES
    .filter((cat) => selectedKeys.includes(cat.key))
    .flatMap((cat) => cat.tasks);
}
