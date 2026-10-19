import React, { useState } from 'react';
import DeclarationDeadlineForm from './DeclarationDeadlineForm';
import ShiftTemplateEditor from './ShiftTemplateEditor';
import styles from '../Manager.module.css';

/** Organization settings: the weekly declaration deadline and (collapsible) shift templates. */
const ScheduleSettingsCard = ({
  settings,
  onSaveDeadline,
  onClearDeadline,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  onError,
}) => {
  const [templatesOpen, setTemplatesOpen] = useState(false);

  return (
    <section className={styles.settingsSection}>
      <div className={styles.sectionCard}>
        <div className={styles.settingsToggleRow}>
          <h3>Ustawienia</h3>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setTemplatesOpen((open) => !open)}
            aria-expanded={templatesOpen}
          >
            {templatesOpen ? 'Ukryj szablony zmian' : 'Szablony zmian'}
          </button>
        </div>

        <DeclarationDeadlineForm settings={settings} onSave={onSaveDeadline} onClear={onClearDeadline} />

        {templatesOpen ? (
          <ShiftTemplateEditor
            templates={templates}
            onSave={onSaveTemplate}
            onDelete={onDeleteTemplate}
            onError={onError}
          />
        ) : null}
      </div>
    </section>
  );
};

export default ScheduleSettingsCard;
