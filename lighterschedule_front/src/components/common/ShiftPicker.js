import React from 'react';
import { getShiftTemplates } from '../../api/shiftTemplates';
import { useApiResource } from '../../hooks/useApiResource';
import { resolveTemplateHours, toDisplayTime } from '../../utils/time';

/**
 * Active shift templates for one day, with slot usage from the server (is_full, slots_remaining).
 * Until it answers: the general list, limited to templates with hours on that weekday.
 * The form needs this data on submit too (is the shift full, which hours), hence a separate hook.
 */
export const useDayShiftTemplates = (date, fallbackTemplates) => {
  const { data } = useApiResource(getShiftTemplates, { active: '1', date }, { initial: null });
  return data ?? fallbackTemplates.filter((template) => resolveTemplateHours(template, date));
};

const optionLabel = (template, date) => {
  const hours = resolveTemplateHours(template, date);
  const time = hours ? ` (${toDisplayTime(hours.start_time)}-${toDisplayTime(hours.end_time)})` : '';
  if (template.is_full) return `${template.name}${time} — brak miejsc`;
  const knowsSlots = template.slots_remaining !== null && template.slots_remaining !== undefined;
  const free = knowsSlots && template.max_slots ? ` · wolne ${template.slots_remaining}/${template.max_slots}` : '';
  return `${template.name}${time}${free}`;
};

/**
 * Shift select shared by the employee and manager panels.
 * Employees can't pick a full shift; with `allowFull` (manager) it is marked but selectable,
 * because the server still refuses a real overfill when the schedule is saved.
 */
const ShiftPicker = ({ date, templates, value, onChange, allowFull = false, placeholder = 'Wybierz zmianę', className }) => (
  <select className={className} value={value} onChange={(event) => onChange(event.target.value)} aria-label="Zmiana">
    <option value="">{placeholder}</option>
    {templates.map((template) => (
      <option key={template.id} value={template.id} disabled={!allowFull && template.is_full === true}>
        {optionLabel(template, date)}
      </option>
    ))}
  </select>
);

export default ShiftPicker;
