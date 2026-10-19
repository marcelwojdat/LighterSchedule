import { useMemo } from 'react';
import { useApiResource } from './useApiResource';
import { getNotifications } from '../api/notifications';
import { getScheduleSettings } from '../api/scheduleSettings';
import { getShiftTemplates } from '../api/shiftTemplates';
import { getSwaps } from '../api/swaps';
import { getTaskTypes } from '../api/taskTypes';
import { getUsers } from '../api/users';
import { getWorkdays } from '../api/workdays';

/** Everything the employee dashboard loads from the API (the API already limits it to this employee). */
export const useEmployeeData = ({ onError }) => {
  const reported = (initial, errorMessage) => ({ initial, errorMessage, onError });

  const workdays = useApiResource(getWorkdays, undefined, reported([], 'Nie udało się pobrać grafika.'));
  const swaps = useApiResource(getSwaps, undefined, reported([], 'Nie udało się pobrać zamian.'));
  const users = useApiResource(getUsers, undefined, reported([], 'Nie udało się pobrać listy pracowników.'));
  const taskTypes = useApiResource(getTaskTypes, undefined, reported([], 'Nie udało się pobrać stanowisk.'));
  const shiftTemplates = useApiResource(
    getShiftTemplates,
    { active: '1' },
    reported([], 'Nie udało się pobrać szablonów zmian.'),
  );
  // Secondary data: failures are silent, the dashboard works without them.
  const scheduleSettings = useApiResource(getScheduleSettings, undefined, { initial: null });
  const notifications = useApiResource(getNotifications, undefined, { initial: { total: 0, items: [] } });

  const colleagues = useMemo(() => users.data.filter((user) => !user.is_manager), [users.data]);

  return {
    workdays: workdays.data,
    setWorkdays: workdays.setData,
    reloadWorkdays: workdays.reload,
    swaps: swaps.data,
    reloadSwaps: swaps.reload,
    colleagues,
    taskTypes: taskTypes.data,
    shiftTemplates: shiftTemplates.data,
    scheduleSettings: scheduleSettings.data,
    notifications: notifications.data,
    reloadNotifications: notifications.reload,
  };
};
