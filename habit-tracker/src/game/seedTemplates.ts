import { TEMPLATE_CATEGORIES, TemplateTask } from '../config/constants';

export function buildTemplateTasks(selectedKeys: string[]): TemplateTask[] {
  return TEMPLATE_CATEGORIES
    .filter((cat) => selectedKeys.includes(cat.key))
    .flatMap((cat) => cat.tasks);
}
