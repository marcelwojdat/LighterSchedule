import React, { useState } from 'react';
import styles from '../Dashboard.module.css';
import { SWAP_STATUS_LABELS } from '../../constants/statusLabels';
import { isPastDate } from '../../utils/dates';
import { displayName } from '../../utils/people';

const hours = (day) => `${day?.start_time?.slice(0, 5)} - ${day?.end_time?.slice(0, 5)}`;
const swapKind = (swap) => (swap.is_two_way ? ' · dwustronna' : ' · przekazanie');

/** A swap is active until a manager approves it or someone rejects it. */
export const isActiveSwap = (swap) => !swap.is_rejected && !swap.approved_by_manager;

const SwapList = ({ title, emptyText, swaps, partyLabel, partyName, targetDayLabel, renderActions }) => (
  <div className={styles.swapListCard}>
    <h4>{title}</h4>
    {swaps.length === 0 ? (
      <p className={styles.swapEmpty}>{emptyText}</p>
    ) : (
      <ul className={styles.swapList}>
        {swaps.map((swap) => (
          <li key={swap.id} className={styles.swapListItem}>
            <div>
              <strong>{swap.work_day_details?.date}</strong>
              <div>{hours(swap.work_day_details)}</div>
              <small>
                {partyLabel}: {partyName(swap)}
                {swapKind(swap)}
              </small>
              {swap.target_work_day_details ? (
                <small>
                  {targetDayLabel}: {swap.target_work_day_details.date} ({hours(swap.target_work_day_details)})
                </small>
              ) : null}
            </div>
            <div className={styles.swapListActions}>
              <span className={styles.swapStatusTag}>{SWAP_STATUS_LABELS[swap.status]}</span>
              {swap.status === 'pending_target' ? renderActions(swap) : null}
            </div>
          </li>
        ))}
      </ul>
    )}
  </div>
);

/**
 * Shift swaps: a form to hand over (or exchange) an approved shift, and the sent / received requests.
 * Remount with a new `key` and `initialWorkDayId` to preselect a shift (the calendar's "give away").
 */
const SwapsSection = ({
  workdays,
  swaps,
  colleagues,
  currentUserId,
  initialWorkDayId = '',
  onLoadColleagueDays,
  onCreate,
  onAccept,
  onReject,
  onError,
}) => {
  const [workDayId, setWorkDayId] = useState(initialWorkDayId);
  const [targetId, setTargetId] = useState('');
  const [targetWorkDayId, setTargetWorkDayId] = useState('');
  const [targetDays, setTargetDays] = useState([]);

  const hasActiveSwap = (dayId) => swaps.some((swap) => swap.work_day === dayId && isActiveSwap(swap));
  const swappableDays = workdays.filter(
    (day) => day.status === 'approved' && !isPastDate(day.date) && !hasActiveSwap(day.id),
  );
  const sent = swaps.filter((swap) => swap.requested_by === currentUserId);
  const received = swaps.filter((swap) => swap.target_user === currentUserId);

  const pickColleague = async (colleagueId) => {
    setTargetId(colleagueId);
    setTargetWorkDayId('');
    setTargetDays(colleagueId ? await onLoadColleagueDays(colleagueId) : []);
  };

  const submit = async () => {
    if (!workDayId || !targetId) {
      onError('Wybierz zmianę i współpracownika, do którego wysyłasz prośbę.');
      return;
    }
    const payload = { work_day: Number(workDayId), target_user: Number(targetId) };
    if (targetWorkDayId) payload.target_work_day = Number(targetWorkDayId);
    if (await onCreate(payload)) {
      setWorkDayId('');
      setTargetId('');
      setTargetWorkDayId('');
      setTargetDays([]);
    }
  };

  return (
    <section className={styles.swapsSection}>
      <h3 className={styles.swapsTitle}>Zamiany zmian</h3>
      <p className={styles.swapsHint}>
        Przekazanie: współpracownik przejmuje Twoją zmianę. Dwustronna zamiana: wybierz też zmianę współpracownika —
        wtedy wymienicie się. Obie opcje wymagają akceptacji współpracownika i zatwierdzenia kierownika. Szybka ścieżka:
        otwórz zatwierdzony dzień w kalendarzu → „Chcę oddać zmianę”.
      </p>

      <div className={styles.swapForm}>
        <select
          value={workDayId}
          onChange={(event) => setWorkDayId(event.target.value)}
          className={workDayId ? styles.swapFieldPrefill : undefined}
        >
          <option value="">Wybierz swoją zmianę</option>
          {swappableDays.map((day) => (
            <option key={day.id} value={day.id}>
              {day.date} ({hours(day)})
            </option>
          ))}
        </select>
        <select value={targetId} onChange={(event) => pickColleague(event.target.value)}>
          <option value="">Wybierz współpracownika</option>
          {colleagues
            .filter((colleague) => colleague.id !== currentUserId)
            .map((colleague) => (
              <option key={colleague.id} value={colleague.id}>
                {displayName(colleague)}
              </option>
            ))}
        </select>
        <select value={targetWorkDayId} onChange={(event) => setTargetWorkDayId(event.target.value)} disabled={!targetId}>
          <option value="">Bez zamiany zwrotnej (tylko przekazanie)</option>
          {targetDays.map((day) => (
            <option key={day.id} value={day.id}>
              Zamiana za: {day.date} ({hours(day)})
            </option>
          ))}
        </select>
        <button type="button" className={styles.swapSubmitBtn} onClick={submit}>
          Wyślij prośbę
        </button>
      </div>

      <div className={styles.swapLists}>
        <SwapList
          title="Wysłane prośby"
          emptyText="Brak wysłanych próśb."
          swaps={sent}
          partyLabel="Do"
          partyName={(swap) => swap.target_user_name}
          targetDayLabel="Za"
          renderActions={(swap) => (
            <button type="button" className={styles.swapRejectBtn} onClick={() => onReject(swap.id)}>
              Anuluj
            </button>
          )}
        />
        <SwapList
          title="Otrzymane prośby"
          emptyText="Brak otrzymanych próśb."
          swaps={received}
          partyLabel="Od"
          partyName={(swap) => swap.requested_by_name}
          targetDayLabel="Oddajesz"
          renderActions={(swap) => (
            <>
              <button type="button" className={styles.swapAcceptBtn} onClick={() => onAccept(swap.id)}>
                Akceptuję
              </button>
              <button type="button" className={styles.swapRejectBtn} onClick={() => onReject(swap.id)}>
                Odrzucam
              </button>
            </>
          )}
        />
      </div>
    </section>
  );
};

export default SwapsSection;
