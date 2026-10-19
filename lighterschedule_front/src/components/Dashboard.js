import React, { useEffect, useRef, useState } from 'react';
import Auth from './Auth';
import ToastStack from './ToastStack';
import UserMenu from './UserMenu';
import CalendarExportPanel from './dashboard/CalendarExportPanel';
import DayPopup from './dashboard/DayPopup';
import DeclarationCalendar from './dashboard/DeclarationCalendar';
import MonthStatsCard from './dashboard/MonthStatsCard';
import SwapsSection, { isActiveSwap } from './dashboard/SwapsSection';
import WeekSummaryCard from './dashboard/WeekSummaryCard';
import styles from './Dashboard.module.css';
import { getErrorMessage } from '../api/client';
import { acceptSwap, createSwap, rejectSwap } from '../api/swaps';
import { getSwappableWorkdays } from '../api/users';
import {
  copyWorkdays,
  createWorkday,
  deleteWorkday,
  downloadWorkdaysIcs,
  getCalendarFeedInfo,
  updateWorkday,
} from '../api/workdays';
import { useDismissibleList } from '../hooks/useDismissibleList';
import { useEmployeeData } from '../hooks/useEmployeeData';
import { useMessages } from '../hooks/useMessages';
import { useTheme } from '../hooks/useTheme';
import { addDays, formatDateStr, getMonday, isPastDate, shiftMonth } from '../utils/dates';
import { formatMonthYearPl } from '../utils/locale';
import { buildWorkdayPayload } from '../utils/time';

const NOTICE_TIMEOUT_MS = 7000;

const currentMonthValue = () => formatDateStr(new Date()).slice(0, 7);

// Module-level, so it is stable between renders (useDismissibleList depends on it).
const notificationKey = (item, index) =>
  `${item.type}|${item.shift_template_id || ''}|${item.date || ''}|${item.message || ''}|${index}`;

/** Banner texts for the weekly declaration window (`closed` blocks all employee edits). */
const deadlineInfo = (settings) => {
  const label = settings?.declaration_close_label;
  return {
    closed: Boolean(settings?.declarations_closed),
    closedMessage: label
      ? `Okno deklaracji jest zamknięte (termin: ${label}). Grafik może zmieniać tylko kierownik.`
      : 'Okno deklaracji jest zamknięte. Grafik może zmieniać tylko kierownik.',
    openMessage: label ? `Deklaracje można składać do ${label} włącznie (powtarza się co tydzień).` : null,
  };
};

/** "dodano 2, pominięto 1" from API counters; empty string when nothing happened. */
const describeCounts = (labels, result) =>
  Object.entries(labels)
    .filter(([key]) => result[key])
    .map(([key, label]) => `${label} ${result[key]}`)
    .join(', ');

/** An employee edits a pending/rejected day in place; a new day becomes a new proposal. */
const saveDeclaration = (existing, payload) =>
  existing ? updateWorkday(existing.id, payload) : createWorkday(payload);

/**
 * Employee dashboard: weekly and monthly summary, the declaration calendar, calendar export and swaps.
 * Declarations are prepared as drafts in the day popup and sent together.
 */
const Dashboard = () => {
  const [selectedDate, setSelectedDate] = useState('');
  const [drafts, setDrafts] = useState({}); // { 'YYYY-MM-DD': declaration not sent yet }
  const [statsMonth, setStatsMonth] = useState(currentMonthValue);
  const [weekStart, setWeekStart] = useState(() => formatDateStr(getMonday()));
  const [giveAway, setGiveAway] = useState({ workDayId: '', key: 0 }); // preselects the swap form
  const [currentUser, setCurrentUser] = useState(null);
  const swapsRef = useRef(null);
  const { error, success, setError, setSuccess, notifySuccess, runAction } = useMessages();
  const { darkMode, toggleTheme } = useTheme();

  const {
    workdays,
    setWorkdays,
    reloadWorkdays,
    swaps,
    reloadSwaps,
    colleagues,
    taskTypes,
    shiftTemplates,
    scheduleSettings,
    notifications,
    reloadNotifications,
  } = useEmployeeData({ onError: setError });

  const { visible: visibleNotices, dismiss: dismissNotice } = useDismissibleList(
    notifications.items,
    notificationKey,
    NOTICE_TIMEOUT_MS,
  );

  useEffect(() => {
    Auth.fetchCurrentUser()
      .then(setCurrentUser)
      .catch(() => Auth.logout());
  }, []);

  const deadline = deadlineInfo(scheduleSettings);
  const workdayFor = (date) => workdays.find((day) => day.date === date);
  const hasActiveSwap = (workdayId) => swaps.some((swap) => swap.work_day === workdayId && isActiveSwap(swap));

  /** False (and shows why) when the declaration window is closed. */
  const ensureDeclarationsOpen = () => {
    if (deadline.closed) setError(deadline.closedMessage);
    return !deadline.closed;
  };

  // --- Day popup and declarations ---

  const addDraft = (date, draft) => {
    setDrafts((prev) => ({ ...prev, [date]: draft }));
    setSelectedDate('');
    setError('');
  };

  const removeDay = async (date) => {
    if (!ensureDeclarationsOpen()) return;
    const existing = workdayFor(date);
    if (existing?.status === 'approved') {
      setError('Nie możesz usuwać zatwierdzonego grafiku.');
      return;
    }
    if (existing && isPastDate(date)) return;
    if (existing) {
      const deleted = await runAction(() => deleteWorkday(existing.id), { failure: 'Błąd przy usuwaniu deklaracji.' });
      if (!deleted) return;
      setWorkdays((prev) => prev.filter((day) => day.date !== date));
    }
    setDrafts(({ [date]: _removed, ...rest }) => rest);
    if (selectedDate === date) setSelectedDate('');
  };

  const sendDrafts = async () => {
    if (!ensureDeclarationsOpen()) return;
    const entries = Object.entries(drafts);
    if (entries.length === 0) {
      setError('Dodaj przynajmniej jedną deklarację przed wysłaniem.');
      return;
    }
    const sent = await runAction(
      () =>
        Promise.all(
          entries.map(([date, draft]) =>
            saveDeclaration(workdayFor(date), buildWorkdayPayload({ ...draft, date, note: draft.note || '' })),
          ),
        ),
      { success: 'Deklaracje zostały wysłane.', failure: 'Błąd połączenia z serwerem.', after: reloadWorkdays },
    );
    if (sent) setDrafts({});
  };

  /** Copies the previous week into this week, or the previous month into the stats month. */
  const copySchedule = (mode) => {
    if (!ensureDeclarationsOpen()) return false;
    const thisMonday = formatDateStr(getMonday());
    const targetStart = mode === 'week' ? thisMonday : `${statsMonth}-01`;
    const sourceStart = mode === 'week' ? addDays(thisMonday, -7) : shiftMonth(targetStart, -1);
    return runAction(
      () => copyWorkdays({ mode, source_start: sourceStart, target_start: targetStart, on_conflict: 'skip' }),
      {
        success: (result) => {
          const counts = describeCounts(
            { created_count: 'dodano', skipped_count: 'pominięto', updated_count: 'zaktualizowano' },
            result,
          );
          return counts
            ? `Skopiowano poprzedni ${mode === 'week' ? 'tydzień' : 'miesiąc'}: ${counts}.`
            : `Brak dni do skopiowania z poprzedniego ${mode === 'week' ? 'tygodnia' : 'miesiąca'}.`;
        },
        failure: 'Nie udało się skopiować grafiku.',
        after: reloadWorkdays,
      },
    );
  };

  // --- Calendar export ---

  const loadCalendarFeed = async () => {
    try {
      return await getCalendarFeedInfo();
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się przygotować linku kalendarza.'));
      return null;
    }
  };

  const downloadIcs = (forMonth) =>
    runAction(() => downloadWorkdaysIcs(forMonth ? { month: statsMonth } : {}), {
      success: forMonth
        ? `Pobrano grafik .ics za ${formatMonthYearPl(statsMonth)}.`
        : 'Pobrano nadchodzące zatwierdzone zmiany (.ics).',
      failure: 'Nie udało się pobrać pliku kalendarza.',
    });

  // --- Swaps ---

  /** From the approved day popup: preselect the shift in the swap form and scroll to it. */
  const startGiveAway = (workday) => {
    if (isPastDate(workday.date) || hasActiveSwap(workday.id)) {
      setError('Tej zmiany nie można teraz oddać (przeszła albo prośba już trwa).');
      return;
    }
    setGiveAway((prev) => ({ workDayId: String(workday.id), key: prev.key + 1 }));
    notifySuccess(
      `Oddajesz zmianę ${workday.date} (${workday.start_time.slice(0, 5)}-${workday.end_time.slice(0, 5)}). ` +
        'Wybierz współpracownika i wyślij prośbę.',
    );
    setSelectedDate('');
    requestAnimationFrame(() => swapsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const loadColleagueDays = async (colleagueId) => {
    try {
      return await getSwappableWorkdays(colleagueId);
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się pobrać zmian współpracownika.'));
      return [];
    }
  };

  const requestSwap = (payload) =>
    runAction(() => createSwap(payload), {
      success: payload.target_work_day
        ? 'Prośba o dwustronną zamianę została wysłana.'
        : 'Prośba o przejęcie zmiany została wysłana.',
      failure: 'Nie udało się wysłać prośby.',
      after: () => Promise.all([reloadSwaps(), reloadNotifications()]),
    });

  const acceptSwapRequest = (swapId) =>
    runAction(() => acceptSwap(swapId), {
      success: 'Zaakceptowano prośbę. Czeka na zatwierdzenie kierownika.',
      failure: 'Nie udało się zaakceptować prośby.',
      after: reloadSwaps,
    });

  const rejectSwapRequest = (swapId) =>
    runAction(() => rejectSwap(swapId), {
      success: 'Prośba została odrzucona.',
      failure: 'Nie udało się odrzucić prośby.',
      after: reloadSwaps,
    });

  const openDay = (date) => {
    setSelectedDate(date);
    setError('');
  };

  const selectedWorkday = selectedDate ? workdayFor(selectedDate) : undefined;

  return (
    <div className={`${styles.dashboardPage} lsFields`}>
      <div className={styles.pageHeader}>
        <h1 className={styles.dashboardTitle}>Twój Grafik Pracy</h1>
        {currentUser ? (
          <UserMenu
            user={{
              name: `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim(),
              email: currentUser.email,
              username: currentUser.username,
            }}
            isManager={currentUser.is_manager}
            darkMode={darkMode}
            onToggleTheme={toggleTheme}
            onLogout={Auth.logout}
            notificationCount={notifications.total || 0}
          />
        ) : null}
      </div>
      <ToastStack
        items={[
          ...visibleNotices.map(({ entry, key }) => ({
            key: `notice-${key}`,
            message: entry.message,
            variant: entry.type === 'shortage' ? 'error' : 'warning',
            onClose: () => dismissNotice(key),
          })),
          { key: 'error', message: error, variant: 'error', onClose: () => setError('') },
          { key: 'success', message: success, variant: 'success', onClose: () => setSuccess('') },
        ]}
      />
      {deadline.closed ? (
        <div className={styles.deadlineBanner}>{deadline.closedMessage}</div>
      ) : deadline.openMessage ? (
        <div className={styles.deadlineInfo}>{deadline.openMessage}</div>
      ) : null}

      <div className={styles.dashboardBody}>
        <div className={styles.statsWrapper}>
          <WeekSummaryCard workdays={workdays} weekStart={weekStart} onWeekChange={setWeekStart} />
          <MonthStatsCard workdays={workdays} month={statsMonth} onMonthChange={setStatsMonth} />
        </div>

        <div className={styles.calendarPanel}>
          <CalendarExportPanel
            month={statsMonth}
            onLoadFeed={loadCalendarFeed}
            onDownload={downloadIcs}
            onSuccess={notifySuccess}
            onError={setError}
          />
          <DeclarationCalendar
            workdays={workdays}
            drafts={drafts}
            declarationsClosed={deadline.closed}
            copyMonth={statsMonth}
            onSelectDate={openDay}
            onCopy={copySchedule}
            onSend={sendDrafts}
          />
        </div>
      </div>

      <div ref={swapsRef}>
        <SwapsSection
          key={giveAway.key}
          initialWorkDayId={giveAway.workDayId}
          workdays={workdays}
          swaps={swaps}
          colleagues={colleagues}
          currentUserId={currentUser?.id}
          onLoadColleagueDays={loadColleagueDays}
          onCreate={requestSwap}
          onAccept={acceptSwapRequest}
          onReject={rejectSwapRequest}
          onError={setError}
        />
      </div>

      {selectedDate ? (
        <DayPopup
          key={selectedDate}
          date={selectedDate}
          existing={selectedWorkday}
          draft={drafts[selectedDate]}
          shiftTemplates={shiftTemplates}
          taskTypes={taskTypes}
          hasActiveSwap={selectedWorkday ? hasActiveSwap(selectedWorkday.id) : false}
          blockedMessage={deadline.closed ? deadline.closedMessage : null}
          onClose={() => setSelectedDate('')}
          onAddDraft={addDraft}
          onRemove={removeDay}
          onGiveAway={startGiveAway}
          onError={setError}
        />
      ) : null}
    </div>
  );
};

export default Dashboard;
