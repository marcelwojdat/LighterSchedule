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

// Saved on click and shown as the server confirmed it, so there is no unsaved state.
// Unknown values (settings still loading) show the server default: on.
const SettingToggle = ({ settings, field, label, onSave }) => (
  <label className="checkboxRow">
    <input
      type="checkbox"
      checked={settings?.[field] ?? true}
      disabled={!settings}
      onChange={(event) => onSave({ [field]: event.target.checked })}
    />
    {label}
  </label>
);

/**
 * Organization settings: the weekly declaration deadline, notices about changed hours,
 * team schedule visibility, shift templates and roles (task types).
 */
const ScheduleSettingsCard = ({
  settings,
  onSaveDeadline,
  onClearDeadline,
  onSaveToggle,
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
            <SettingToggle key={field} settings={settings} field={field} label={label} onSave={onSaveToggle} />
          ))}
        </div>

        <div className={styles.deadlineForm}>
          <div>
            <span className={styles.deadlineLabel}>Widoczność grafiku</span>
            <p className={styles.statHint}>
              Pracownicy widzą tylko zatwierdzone zmiany kolegów: kto, kiedy i na jakiej zmianie. Bez stawek i notatek.
            </p>
          </div>
          <SettingToggle
            settings={settings}
            field="team_schedule_visible"
            label="Pracownicy widzą grafik zespołu"
            onSave={onSaveToggle}
          />
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
