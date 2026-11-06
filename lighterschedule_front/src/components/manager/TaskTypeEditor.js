import React, { useState } from 'react';
import styles from '../Manager.module.css';

const EMPTY_FORM = { id: null, name: '' };

/**
 * Roles employees pick for a shift (e.g. Kasa, Magazyn): add, rename, delete.
 * `onSave(payload, id)` and `onDelete(taskType)` resolve to true on success.
 */
const TaskTypeEditor = ({ taskTypes, onSave, onDelete, onError }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const reset = () => setForm(EMPTY_FORM);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      onError('Podaj nazwę stanowiska (np. Kasa).');
      return;
    }
    if (await onSave({ name }, form.id)) reset();
  };

  const remove = async (taskType) => {
    const question =
      `Usunąć stanowisko „${taskType.name}"? Zapisane zmiany z tym stanowiskiem zostaną, ale bez stanowiska.`;
    if (!window.confirm(question)) return;
    if ((await onDelete(taskType)) && form.id === taskType.id) reset();
  };

  return (
    <div className={styles.shiftTemplatesPanel}>
      <p className={styles.statHint}>
        Stanowiska wybierane przy deklaracji i w grafiku. Zmiana nazwy obejmuje też już zapisane zmiany.
      </p>
      <form className={styles.taskTypeForm} onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Nazwa stanowiska (np. Kasa)"
          aria-label="Nazwa stanowiska"
          maxLength={50}
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
        <div className={styles.queueActions}>
          <button type="submit" className={styles.btnPrimary}>
            {form.id ? 'Zapisz nazwę' : 'Dodaj stanowisko'}
          </button>
          {form.id ? (
            <button type="button" className={styles.btnSecondary} onClick={reset}>
              Anuluj edycję
            </button>
          ) : null}
        </div>
      </form>

      {taskTypes.length === 0 ? (
        <p className={styles.emptyQueue}>Brak stanowisk — pracownicy deklarują zmiany bez stanowiska.</p>
      ) : (
        <ul className={styles.templateList}>
          {taskTypes.map((taskType) => (
            <li key={taskType.id} className={styles.templateListItem}>
              <strong>{taskType.name}</strong>
              <div className={styles.queueActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setForm({ id: taskType.id, name: taskType.name })}
                  aria-label={`Edytuj stanowisko ${taskType.name}`}
                >
                  Edytuj
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => remove(taskType)}
                  aria-label={`Usuń stanowisko ${taskType.name}`}
                >
                  Usuń
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TaskTypeEditor;
