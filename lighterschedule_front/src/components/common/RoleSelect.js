import React from 'react';

/** Task type (role) dropdown; `onChange` receives the selected id as a string ('' = none). */
const RoleSelect = ({ taskTypes, value, onChange, className, placeholder = 'Stanowisko' }) => (
  <select value={value} onChange={(event) => onChange(event.target.value)} className={className}>
    <option value="">{placeholder}</option>
    {taskTypes.map((type) => (
      <option key={type.id} value={type.id}>
        {type.name}
      </option>
    ))}
  </select>
);

export default RoleSelect;
