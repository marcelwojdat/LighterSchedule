import React from 'react';
import styles from '../Manager.module.css';

/** Task type (role) dropdown; `onChange` receives the selected id as a string ('' = none). */
const RoleSelect = ({ taskTypes, value, onChange }) => (
  <select value={value} onChange={(event) => onChange(event.target.value)} className={styles.roleSelect}>
    <option value="">Stanowisko</option>
    {taskTypes.map((type) => (
      <option key={type.id} value={type.id}>
        {type.name}
      </option>
    ))}
  </select>
);

export default RoleSelect;
