import React, { useState } from 'react';
import styles from '../Dashboard.module.css';
import { formatMonthYearPl } from '../../utils/locale';

/**
 * "Add to calendar": .ics downloads and a subscription link (loaded the first time the panel opens).
 * `onLoadFeed()` resolves to the feed info or null; `onDownload(forMonth)` to true on success.
 */
const CalendarExportPanel = ({ month, onLoadFeed, onDownload, onSuccess, onError }) => {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState(null);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setOpen(!open);
    if (!open && !feed) setFeed(await onLoadFeed());
  };

  const download = async (forMonth) => {
    setBusy(true);
    try {
      await onDownload(forMonth);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(feed.url);
      onSuccess('Skopiowano link subskrypcji kalendarza.');
    } catch {
      onError('Nie udało się skopiować linku — zaznacz go ręcznie.');
    }
  };

  return (
    <>
      <div className={styles.calendarHeader}>
        <div>
          <p className={styles.calendarLabel}>Kalendarz</p>
          <div className={styles.calendarHeaderTitle}>Deklaruj swoją dyspozycyjność</div>
        </div>
        <button type="button" className={styles.calendarExportToggle} onClick={toggle} aria-expanded={open}>
          {open ? 'Ukryj eksport' : 'Dodaj do kalendarza'}
        </button>
      </div>

      {open ? (
        <div className={styles.calendarExportPanel}>
          <p className={styles.calendarExportHint}>
            Google Calendar: Ustawienia → Importuj lub dodaj kalendarz przez URL. Apple Calendar: otwórz pobrany plik
            .ics albo dodaj subskrypcję kalendarza.
          </p>
          <div className={styles.calendarExportActions}>
            <button type="button" className={styles.calendarExportBtn} disabled={busy} onClick={() => download(false)}>
              Pobierz .ics (nadchodzące)
            </button>
            <button type="button" className={styles.calendarExportBtnSecondary} disabled={busy} onClick={() => download(true)}>
              Pobierz .ics ({formatMonthYearPl(month)})
            </button>
          </div>
          {feed?.url ? (
            <div className={styles.calendarFeedBox}>
              <div className={styles.calendarFeedLabel}>Subskrypcja (auto-odświeżanie)</div>
              <code className={styles.calendarFeedUrl}>{feed.url}</code>
              <div className={styles.calendarExportActions}>
                <button type="button" className={styles.calendarExportBtnSecondary} onClick={copyLink}>
                  Kopiuj link
                </button>
                {feed.webcal_url ? (
                  <a className={styles.calendarExportBtnSecondary} href={feed.webcal_url}>
                    Otwórz w kalendarzu
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
};

export default CalendarExportPanel;
