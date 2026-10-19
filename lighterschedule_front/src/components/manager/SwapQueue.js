import React, { useState } from 'react';
import RejectionReasonPicker from './RejectionReasonPicker';
import styles from '../Manager.module.css';
import { SWAP_STATUS_LABELS } from '../../constants/statusLabels';

const hours = (day) => `${day?.start_time?.slice(0, 5)} - ${day?.end_time?.slice(0, 5)}`;

/**
 * Swaps accepted by the colleague and waiting for the manager.
 * `onReject(swap, reason)` resolves to true on success; the form stays open otherwise.
 */
const SwapQueue = ({ swaps, rejectionReasons, onApprove, onReject }) => {
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState('');

  const startRejecting = (swap) => {
    setRejectingId(swap.id);
    setReason('');
  };

  const confirmReject = async (swap) => {
    if (await onReject(swap, reason.trim())) setRejectingId(null);
  };

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <h3>Zamiany do zatwierdzenia</h3>
        <span className={styles.queueBadge}>{swaps.length}</span>
      </div>
      {swaps.length === 0 ? (
        <p className={styles.emptyQueue}>Brak zamian oczekujących na zatwierdzenie.</p>
      ) : (
        <div className={styles.queueList}>
          {swaps.map((swap) => (
            <div key={swap.id} className={styles.swapQueueItem}>
              <div className={styles.queueItemHeader}>
                <strong>{swap.work_day_details?.date}</strong>
                <span>{SWAP_STATUS_LABELS[swap.status]}</span>
              </div>
              <div className={styles.queueHours}>
                {hours(swap.work_day_details)}
                {swap.is_two_way ? ' · dwustronna' : ' · przekazanie'}
              </div>
              <div className={styles.swapTransfer}>
                <span>{swap.requested_by_name}</span>
                <span>{swap.is_two_way ? '⇄' : '→'}</span>
                <span>{swap.target_user_name}</span>
              </div>
              {swap.target_work_day_details ? (
                <div className={styles.queueHours}>
                  Za: {swap.target_work_day_details.date} ({hours(swap.target_work_day_details)})
                </div>
              ) : null}

              {rejectingId === swap.id ? (
                <>
                  <RejectionReasonPicker reasons={rejectionReasons} value={reason} onChange={setReason} />
                  <div className={styles.queueActions}>
                    <button type="button" className={styles.btnDanger} onClick={() => confirmReject(swap)}>
                      Potwierdź odrzucenie
                    </button>
                    <button type="button" className={styles.btnSecondary} onClick={() => setRejectingId(null)}>
                      Anuluj
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.queueActions}>
                  <button type="button" className={styles.btnSuccess} onClick={() => onApprove(swap)}>
                    Zatwierdź zamianę
                  </button>
                  <button type="button" className={styles.btnDanger} onClick={() => startRejecting(swap)}>
                    Odrzuć
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SwapQueue;
