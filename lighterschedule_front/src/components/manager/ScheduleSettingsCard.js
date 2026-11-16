import React, { useState } from 'react';
import DeclarationDeadlineForm from './DeclarationDeadlineForm';
import ShiftTemplateEditor from './ShiftTemplateEditor';
import TaskTypeEditor from './TaskTypeEditor';
import styles from '../Manager.module.css';

// Collapsible panels; at most one is open at a time.
const PANELS = [
  { key: 'templates', label: 'Szablony zmian', hideLabel: 'Ukryj szablony zmian' },
  { key: 'taskTypes', label: 'Stanowiska', hideLabel: 'Ukryj stanowiska' },
];

const HOUR_CHANGE_TOGGLES = [
  { field: 'notify_hour_changes', label: 'Pokazuj pracownikowi komunikat w panelu' },
  { field: 'email_hour_changes', label: 'Wysyłaj pracownikowi e-mail' },
];

/**
 * Organization settings: the weekly declaration deadline, notices about changed hours,
 * shift templates and roles (task types).
 */
const ScheduleSettingsCard = ({
  settings,
  onSaveDeadline,
  onClearDeadline,
  onSaveHourChangeSetting,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  taskTypes,
  onSaveTaskType,
  onDeleteTaskType,
  onError,
}) => {
  const [openPanel, setOpenPanel] = useState(null);
  const toggle = (key) => setOpenPanel((open) => (open === key ? null : key));

  return (
    <section className={styles.settingsSection}>
      <div className={styles.sectionCard}>
        <div className={styles.settingsToggleRow}>
          <h3>Ustawienia</h3>
          <div className={styles.settingsToggleButtons}>
            {PANELS.map(({ key, label, hideLabel }) => (
              <button
                key={key}
                type="button"
                className={styles.btnSecondary}
                onClick={() => toggle(key)}
                aria-expanded={openPanel === key}
              >
                {openPanel === key ? hideLabel : label}
              </button>
            ))}
          </div>
        </div>

        <DeclarationDeadlineForm settings={settings} onSave={onSaveDeadline} onClear={onClearDeadline} />

        <div className={styles.deadlineForm}>
          <div>
            <span className={styles.deadlineLabel}>Zmiany godzin</span>
            <p className={styles.statHint}>
              Gdy zmienisz godziny czyjejś zmiany, pracownik zawsze zobaczy znacznik w kalendarzu. Tu decydujesz o
              dodatkowych powiadomieniach.
            </p>
          </div>
          {HOUR_CHANGE_TOGGLES.map(({ field, label }) => (
            // Saved on click and shown as the server confirmed it, so there is no unsaved state.
            <label key={field} className="checkboxRow">
              <input
                type="checkbox"
                checked={settings?.[field] ?? true}
                disabled={!settings}
                onChange={(event) => onSaveHourChangeSetting({ [field]: event.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>

        {openPanel === 'templates' ? (
          <ShiftTemplateEditor
            templates={templates}
            onSave={onSaveTemplate}
            onDelete={onDeleteTemplate}
            onError={onError}
          />
        ) : null}
        {openPanel === 'taskTypes' ? (
          <TaskTypeEditor
            taskTypes={taskTypes}
            onSave={onSaveTaskType}
            onDelete={onDeleteTaskType}
            onError={onError}
          />
        ) : null}
      </div>
    </section>
  );
};

export default ScheduleSettingsCard;
