import React, { useMemo } from 'react';
import CoverageLegend from './CoverageLegend';
import styles from '../Manager.module.css';
import { addDays, formatDateStr, getMonday, getWeekDates } from '../../utils/dates';
import { getDayShiftCoverage } from '../../utils/shiftCoverage';
import { WEEKDAY_SHORT } from '../../utils/time';

const HEADER_CLASS = {
  closed: styles.teamDayHeaderClosed,
  open: styles.teamDayHeaderOpen,
  none: styles.teamDayHeaderNone,
};
const CELL_CLASS = {
  closed: styles.teamDayCellClosed,
  open: styles.teamDayCellOpen,
  none: styles.teamDayCellNone,
};

const displayName = (employee) =>
  `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.username;

/** "filled/max" across all shifts of the day, e.g. "3/4"; empty when the day has no shifts. */
const slotSummary = (coverage) => {
  if (!coverage.slots.length) return '';
  const filled = coverage.slots.reduce((sum, slot) => sum + slot.filled, 0);
  const max = coverage.slots.reduce((sum, slot) => sum + slot.max, 0);
  return `${filled}/${max}`;
};

/** Approved shifts of every employee for one week, with per-day staffing coverage. */
const TeamWeekOverview = ({ weekStart, onWeekChange, employees, workdays, shiftTemplates }) => {
  const weekDates = getWeekDates(weekStart);

  // One coverage calculation per day, shared by the column header and all its cells.
  const coverageByDate = useMemo(
    () => Object.fromEntries(
      getWeekDates(weekStart).map((date) => [date, getDayShiftCoverage(date, shiftTemplates, workdays)]),
    ),
    [weekStart, shiftTemplates, workdays],
  );

  const shiftsOf = (employeeId, date) =>
    workdays.filter((day) => day.employee === employeeId && day.date === date);

  return (
    <section className={styles.teamOverviewSection}>
      <div className={styles.teamOverviewHeader}>
        <div>
          <h3>Widok zbiorczy zespołu</h3>
          <p className={styles.teamOverviewHint}>
            Zatwierdzone zmiany — tydzień od {weekDates[0]} do {weekDates[6]}
          </p>
        </div>
        <div className={styles.weekNav}>
          <button type="button" className={styles.btnSecondary} onClick={() => onWeekChange(addDays(weekStart, -7))}>
            Poprzedni tydzień
          </button>
          <button type="button" className={styles.btnSecondary} onClick={() => onWeekChange(formatDateStr(getMonday()))}>
            Bieżący tydzień
          </button>
          <button type="button" className={styles.btnSecondary} onClick={() => onWeekChange(addDays(weekStart, 7))}>
            Następny tydzień
          </button>
        </div>
      </div>
      <CoverageLegend />
      <div className={styles.teamTableWrap}>
        <table className={styles.teamTable}>
          <thead>
            <tr>
              <th>Pracownik</th>
              {weekDates.map((date, index) => {
                const coverage = coverageByDate[date];
                const summary = slotSummary(coverage);
                return (
                  <th
                    key={date}
                    className={`${styles.teamDayHeader} ${HEADER_CLASS[coverage.status]}`}
                    title={coverage.tooltip || undefined}
                  >
                    <div>{WEEKDAY_SHORT[index]}</div>
                    <small>{date.slice(5)}</small>
                    {summary ? <div className={styles.teamDayHeaderMeta}>{summary}</div> : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <th className={styles.teamEmployeeCell}>{displayName(employee)}</th>
                {weekDates.map((date) => {
                  const coverage = coverageByDate[date];
                  const shifts = shiftsOf(employee.id, date);
                  return (
                    <td
                      key={`${employee.id}-${date}`}
                      className={`${styles.teamDayCell} ${CELL_CLASS[coverage.status]}`}
                      title={coverage.tooltip || undefined}
                    >
                      {shifts.length === 0 ? (
                        <span className={styles.teamEmptyCell}>—</span>
                      ) : (
                        shifts.map((shift) => {
                          const slot = coverage.slots.find((item) => Number(item.id) === Number(shift.shift_template));
                          const incomplete = slot && !slot.isFull;
                          return (
                            <div
                              key={shift.id}
                              className={`${styles.teamShift} ${incomplete ? styles.teamShiftIncomplete : ''}`}
                            >
                              <div>
                                {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
                              </div>
                              {shift.shift_template_name ? <small>{shift.shift_template_name}</small> : null}
                              {shift.role_name ? <small>{shift.role_name}</small> : null}
                              {incomplete ? <span className={styles.teamShiftDot} aria-hidden="true" /> : null}
                            </div>
                          );
                        })
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default TeamWeekOverview;
