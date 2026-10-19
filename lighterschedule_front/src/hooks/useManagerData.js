import { useMemo } from 'react';
import { useApiResource } from './useApiResource';
import { getNotifications } from '../api/notifications';
import { getRejectionReasons } from '../api/rejectionReasons';
import { getScheduleHoles } from '../api/scheduleHoles';
import { getScheduleSettings } from '../api/scheduleSettings';
import { getShiftTemplates } from '../api/shiftTemplates';
import { getTeamStats } from '../api/stats';
import { getSwaps } from '../api/swaps';
import { getTaskTypes } from '../api/taskTypes';
import { getUsers } from '../api/users';
import { getWorkdays } from '../api/workdays';
import { getWeekDates } from '../utils/dates';
import { monthBounds } from '../utils/shiftCoverage';

/**
 * Everything the manager panel loads from the API.
 *
 * Each resource reloads itself when its params change (month, week, employee…);
 * `refreshData` reloads all of them after an action that can affect several sections.
 */
export const useManagerData = ({ statsMonth, weekStart, coverageMonth, holesDays, selectedEmployee, onError }) => {
  const weekDates = getWeekDates(weekStart);
  const coverageRange = monthBounds(coverageMonth.year, coverageMonth.month);
  const reported = (initial, errorMessage) => ({ initial, errorMessage, onError });

  const users = useApiResource(getUsers, undefined, reported([], 'Nie udało się pobrać listy pracowników'));
  const proposals = useApiResource(
    getWorkdays,
    { status: 'proposed' },
    reported([], 'Nie udało się pobrać kolejki akceptacji'),
  );
  const swaps = useApiResource(
    getSwaps,
    { pending_manager: 'true' },
    reported([], 'Nie udało się pobrać zamian do zatwierdzenia'),
  );
  const teamStats = useApiResource(getTeamStats, statsMonth, reported(null, 'Nie udało się pobrać statystyk zespołu'));
  const teamWorkdays = useApiResource(
    getWorkdays,
    { status: 'approved', date_from: weekStart, date_to: weekDates[6] },
    reported([], 'Nie udało się pobrać grafiku zespołu'),
  );
  const coverageWorkdays = useApiResource(
    getWorkdays,
    { status: 'approved', date_from: coverageRange.dateFrom, date_to: coverageRange.dateTo },
    reported([], 'Nie udało się pobrać obsadzenia zmian'),
  );
  const employeeWorkdays = useApiResource(
    getWorkdays,
    { employee: selectedEmployee?.id },
    { ...reported([], 'Nie udało się pobrać grafiku pracownika'), enabled: Boolean(selectedEmployee) },
  );
  const taskTypes = useApiResource(getTaskTypes, undefined, reported([], 'Nie udało się pobrać stanowisk'));
  const shiftTemplates = useApiResource(getShiftTemplates, undefined, reported([], 'Nie udało się pobrać szablonów zmian'));
  const scheduleSettings = useApiResource(
    getScheduleSettings,
    undefined,
    reported(null, 'Nie udało się pobrać ustawień grafiku'),
  );
  // Secondary data: failures are silent, the panel works without them.
  const rejectionReasons = useApiResource(getRejectionReasons, { active: '1' }, { initial: [] });
  const scheduleHoles = useApiResource(getScheduleHoles, { days: holesDays }, { initial: { count: 0, items: [] } });
  const notifications = useApiResource(getNotifications, undefined, { initial: { total: 0, items: [] } });

  const employees = useMemo(
    () => users.data.filter((user) => !user.is_manager && user.is_active !== false),
    [users.data],
  );
  const pendingQueue = useMemo(
    () => [...proposals.data].sort((a, b) => a.date.localeCompare(b.date)),
    [proposals.data],
  );

  const refreshData = () =>
    Promise.all([
      users.reload(),
      proposals.reload(),
      swaps.reload(),
      teamStats.reload(),
      teamWorkdays.reload(),
      coverageWorkdays.reload(),
      taskTypes.reload(),
      shiftTemplates.reload(),
      scheduleSettings.reload(),
      rejectionReasons.reload(),
      scheduleHoles.reload(),
      notifications.reload(),
      selectedEmployee ? employeeWorkdays.reload() : null,
    ]);

  return {
    allUsers: users.data,
    setAllUsers: users.setData,
    reloadUsers: users.reload,
    employees,
    pendingQueue,
    swapQueue: swaps.data,
    teamStats: teamStats.data,
    teamWorkdays: teamWorkdays.data,
    coverageWorkdays: coverageWorkdays.data,
    workdays: employeeWorkdays.data,
    reloadEmployeeWorkdays: employeeWorkdays.reload,
    taskTypes: taskTypes.data,
    shiftTemplates: shiftTemplates.data,
    reloadShiftTemplates: shiftTemplates.reload,
    scheduleSettings: scheduleSettings.data,
    setScheduleSettings: scheduleSettings.setData,
    rejectionReasons: rejectionReasons.data,
    scheduleHoles: scheduleHoles.data,
    notifications: notifications.data,
    refreshData,
  };
};
