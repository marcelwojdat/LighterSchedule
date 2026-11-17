import React, { useEffect, useMemo, useState } from 'react';
import styles from '../Dashboard.module.css';
import { getTeamSchedule } from '../../api/workdays';
import { addDays, formatDateStr, getMonday, getWeekDates } from '../../utils/dates';
import { WEEKDAY_SHORT } from '../../utils/time';
import { formatWeekRangeLabel } from '../../utils/weekSummary';

const hhmm = (time) => time.slice(0, 5);

/**
 * Read-only week of the team's approved shifts, day by day.
 * Renders nothing when the manager has hidden the team schedule (the server answers 403).
 */
const TeamSchedule = ({ currentUserId }) => {
  const [weekStart, setWeekStart] = useState(() => formatDateStr(getMonday()));
  const [state, setState] = useState({ status: 'loading', shifts: [] });

  useEffect(() => {
    // Ignore answers for a week the user has already left (fast clicks on the arrows).
    let active = true;
    setState({ status: 'loading', shifts: [] });
    getTeamSchedule({ date_from: weekStart, date_to: addDays(weekStart, 6) })
      .then((shifts) => {
        if (active) setState({ status: 'ready', shifts });
      })
      .catch((err) => {
        if (active) setState({ status: err.response?.status === 403 ? 'hidden' : 'error', shifts: [] });
      });
    return () => {
      active = false;
    };
  }, [weekStart]);

  const weekDates = getWeekDates(weekStart);
  // The server already sorts by date, start time and surname.
  const shiftsByDate = useMemo(() => {
    const grouped = {};
    state.shifts.forEach((shift) => {
      (grouped[shift.date] ||= []).push(shift);
    });
    return grouped;
  }, [state.shifts]);

  if (state.status === 'hidden') return null;

  return (
    <section className={styles.swapsSection} aria-label="Grafik zespołu">
      <div className={styles.statsHeader}>
        <div>
          <h2 className={styles.swapsTitle}>Grafik zespołu</h2>
          <p className={styles.swapsHint}>
            Zatwierdzone zmiany, {formatWeekRangeLabel(weekDates[0], weekDates[6])}. Tylko podgląd.
          </p>
        </div>
        <div className={styles.weekNav}>
          <button
            type="button"
            className={styles.weekNavBtn}
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Poprzedni tydzień"
          >
            ←
          </button>
          <button type="button" className={styles.weekNavBtn} onClick={() => setWeekStart(formatDateStr(getMonday()))}>
            Ten tydzień
          </button>
          <button
            type="button"
            className={styles.weekNavBtn}
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Następny tydzień"
          >
            →
          </button>
        </div>
      </div>

      {state.status === 'error' ? (
        <p className={styles.swapEmpty}>Nie udało się pobrać grafiku zespołu.</p>
      ) : state.status === 'loading' ? (
        <p className={styles.swapEmpty}>Ładowanie grafiku zespołu…</p>
      ) : (
        <div className={styles.teamDays}>
          {weekDates.map((date, index) => {
            const shifts = shiftsByDate[date] || [];
            return (
              <div key={date} className={styles.teamDay}>
                <h3 className={styles.teamDayTitle}>
                  {WEEKDAY_SHORT[index]} {date.slice(8)}.{date.slice(5, 7)}
                </h3>
                {shifts.length === 0 ? (
                  <p className={styles.swapEmpty}>Nikt nie pracuje.</p>
                ) : (
                  <ul className={styles.teamDayList} aria-label={`Zmiany ${date}`}>
                    {shifts.map((shift) => {
                      const mine = shift.employee === currentUserId;
                      return (
                        <li key={shift.id} className={`${styles.teamDayShift} ${mine ? styles.teamDayShiftMine : ''}`}>
                          <strong>
                            {hhmm(shift.start_time)}–{hhmm(shift.end_time)}
                          </strong>{' '}
                          {shift.employee_name}
                          {mine ? ' (Ty)' : ''}
                          {shift.shift_template_name || shift.role_name ? (
                            <small>
                              {[shift.shift_template_name, shift.role_name].filter(Boolean).join(' · ')}
                            </small>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default TeamSchedule;
