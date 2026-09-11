import React from 'react';
import { Link } from 'react-router-dom';
import styles from './MarketingStub.module.css';

const LegalPage = ({ title, children }) => (
  <div className={styles.stub}>
    <p className={styles.eyebrow}>Dokumenty</p>
    <h1>{title}</h1>
    <div className={styles.legalBody}>{children}</div>
    <div className={styles.actions}>
      <Link to="/" className={styles.secondary}>
        Wróć na start
      </Link>
    </div>
  </div>
);

export const TermsPage = () => (
  <LegalPage title="Regulamin">
    <p>
      <h1>REGULAMIN ŚWIADCZENIA USŁUG CYFROWYCH I SUBSKRYPCJI</h1>
      <h2>prostygrafik.com</h2>
      <hr />

      <section>
        <h3>§ 1. POSTANOWIENIA OGÓLNE</h3>
        <ol>
          <li>
            Niniejszy Regulamin określa zasady korzystania z serwisu internetowego znajdującego się pod adresem{' '}
            <strong>prostygrafik.com</strong> (zwanego dalej „Serwisem”), zasady zamawiania i świadczenia usług cyfrowych
            w modelu subskrypcyjnym oraz prawa i obowiązki Usługodawcy i Użytkowników.
          </li>
          <li>
            Podmiotem prowadzącym Serwis oraz Usługodawcą jest <strong>Marcel Wojdat</strong>, prowadzący działalność pod
            adresem e-mail: <strong>prostygrafik@gmail.com</strong> (zwany dalej „Usługodawcą”).
          </li>
          <li>
            Niniejszy Regulamin stanowi regulamin, o którym mowa w art. 8 ustawy z dnia 18 lipca 2002 r. o świadczeniu usług
            drogą elektroniczną (t.j. Dz.U. z 2020 r. poz. 344 ze zm.).
          </li>
          <li>
            Przed rozpoczęciem korzystania z Serwisu oraz dokonaniem zakupu Subskrypcji, Użytkownik zobowiązany jest do
            zapoznania się z treścią Regulaminu i jego akceptacji.
          </li>
          <li>
            Informacje znajdujące się na stronie Serwisu nie stanowią oferty w rozumieniu art. 66 ustawy z dnia 23 kwietnia 1964 r.
            Kodeks cywilny (t.j. Dz.U. z 2023 r. poz. 1610 ze zm.), lecz zaproszenie do zawarcia umowy w myśl art. 71 Kodeksu cywilnego.
          </li>
        </ol>
      </section>

      <section>
        <h3>§ 2. DEFINICJE</h3>
        <ol>
          <li><strong>Usługodawca</strong> – Marcel Wojdat.</li>
          <li><strong>Serwis</strong> – serwis internetowy dostępny pod domeną prostygrafik.com.</li>
          <li>
            <strong>Użytkownik / Klient</strong> – osoba fizyczna posiadająca pełną zdolność do czynności prawnych (lub posiadająca
            ograniczoną zdolność do czynności prawnych za zgodą przedstawiciela ustawowego), osoba prawna lub jednostka organizacyjna
            nieposiadająca osobowości prawnej, korzystająca z Serwisu.
          </li>
          <li>
            <strong>Konsument</strong> – Użytkownik będący osobą fizyczną zawierającą Umowę niezwiązaną bezpośrednio z jej działalnością
            gospodarczą lub zawodową.
          </li>
          <li>
            <strong>Przedsiębiorca na prawach Konsumenta (PNPK)</strong> – osoba fizyczna zawierająca Umowę bezpośrednio związaną z jej
            działalnością gospodarczą, gdy z treści Umowy wynika, że nie posiada ona dla tej osoby charakteru zawodowego.
          </li>
          <li>
            <strong>Usługa Cyfrowa</strong> – usługa świadczona drogą elektroniczną przez Usługodawcę na rzecz Użytkownika, polegająca
            na udostępnieniu funkcjonalności oprogramowania Prosty Grafik dostępnego w modelu SaaS (Software as a Service).
          </li>
          <li>
            <strong>Subskrypcja</strong> – odpłatny wariant dostępu do Usługi Cyfrowej, rozliczany w cyklach odnawialnych.
          </li>
          <li>
            <strong>Okres Rozliczeniowy</strong> – okres, na jaki została zawarta Subskrypcja (np. 1 miesiąc, 1 rok), po upływie którego
            następuje automatyczne odnowienie płatności, chyba że Użytkownik zrezygnuje z Subskrypcji.
          </li>
          <li>
            <strong>Konto</strong> – indywidualny panel zarządczy Użytkownika w Serwisie, utworzony w procesie rejestracji.
          </li>
        </ol>
      </section>

      <section>
        <h3>§ 3. WYMAGANIA TECHNICZNE I FUNKCJONALNOŚĆ</h3>
        <ol>
          <li>
            Do korzystania z Serwisu oraz Usługi Cyfrowej niezbędne są:
            <ul>
              <li>Urządzenie z dostępem do sieci Internet,</li>
              <li>Zainstalowana aktualna wersja przeglądarki internetowej z włączoną obsługą JavaScript oraz plików cookies,</li>
              <li>Aktywne konto poczty elektronicznej (e-mail).</li>
            </ul>
          </li>
          <li>
            Usługodawca zapewnia kompatybilność, funkcjonalność oraz interoperacyjność Usługi Cyfrowej ze standardowym środowiskiem
            cyfrowym spełniającym wymogi określone w ust. 1.
          </li>
        </ol>
      </section>

      <section>
        <h3>§ 4. REJESTRACJA KONTA I ŚWIADCZENIE USŁUG ELEKTRONICZNYCH</h3>
        <ol>
          <li>Korzystanie z pełnej funkcjonalności Usługi Cyfrowej wymaga założenia Konta w Serwisie.</li>
          <li>
            Umowa o świadczenie usługi prowadzenia Konta zawierana jest na czas nieokreślony z chwilą zakończenia procesu rejestracji.
            Prowadzenie Konta jest bezpłatne.
          </li>
          <li>
            Użytkownik może w każdym czasie, bez podania przyczyny i bez ponoszenia kosztów, usunąć Konto poprzez wysłanie żądania na adres:{' '}
            <strong>prostygrafik@gmail.com</strong> lub za pośrednictwem odpowiedniej opcji w panelu Konta.
          </li>
        </ol>
      </section>

      <section>
        <h3>§ 5. WARUNKI ZAKUPU SUBSKRYPCJI I PŁATNOŚCI</h3>
        <ol>
          <li>
            Zakup Subskrypcji następuje poprzez wybór odpowiedniego planu subskrypcyjnego w Serwisie, wypełnienie formularza zamówienia
            oraz dokonanie płatności.
          </li>
          <li>Ceny podane w Serwisie są cenami brutto wyrażonymi w złotych polskich (PLN).</li>
          <li>
            Płatności za Subskrypcję realizowane są w formie płatności odnawialnych (cyklicznych) za pośrednictwem zintegrowanego operatora
            płatności elektronicznych.
          </li>
          <li>
            Pobranie opłaty za kolejny Okres Rozliczeniowy następuje automatycznie na początku każdego takiego okresu.
          </li>
          <li>
            Użytkownik wyraża zgodę na automatyczne obciążanie jego karty płatniczej lub rachunku płatniczego kwotą należną za każdy kolejny
            Okres Rozliczeniowy Subskrypcji.
          </li>
          <li>
            Użytkownik może w dowolnym momencie zrezygnować z automatycznego odnawiania Subskrypcji ze skutkiem na koniec bieżącego Okresu
            Rozliczeniowego, dokonując zmiany ustawień w panelu Konta lub zgłaszając taki fakt na adres: <strong>prostygrafik@gmail.com</strong>.
          </li>
          <li>
            W przypadku braku możliwości pobrania opłaty subskrypcyjnej, Usługodawca ma prawo zawiesić dostęp do Usługi Cyfrowej do momentu
            uregulowania należności.
          </li>
        </ol>
      </section>

      <section>
        <h3>§ 6. ODSTĄPIENIE OD UMOWY (KONSUMENCI ORAZ PNPK)</h3>
        <ol>
          <li>
            Zgodnie z art. 27 ustawy z dnia 30 maja 2014 r. o prawach konsumenta, Konsumentowi oraz Przedsiębiorcy na prawach Konsumenta
            przysługuje prawo do odstąpienia od Umowy zawartej na odległość bez podania przyczyny w terminie 14 dni od dnia jej zawarcia.
          </li>
          <li>
            Do zachowania terminu wystarczy wysłanie oświadczenia o odstąpieniu przed jego upływem na adres e-mail:{' '}
            <strong>prostygrafik@gmail.com</strong>.
          </li>
          <li>
            <strong>Pouczenie o utracie prawa do odstąpienia od umowy:</strong> Zgodnie z art. 38 ust. 1 pkt 13 ustawy o prawach konsumenta,
            prawo do odstąpienia od umowy o dostarczanie treści cyfrowych lub usług cyfrowych <strong>nie przysługuje</strong>, jeżeli Usługodawca
            rozpoczął świadczenie usługi za wyraźną i uprzednią zgodą Konsumenta lub PNPK przed upływem terminu do odstąpienia od umowy i po
            poinformowaniu go o utracie prawa do odstąpienia od umowy.
          </li>
        </ol>
      </section>

      <section>
        <h3>§ 7. ODPOWIEDZIALNOŚĆ ZA ZGODNOŚĆ USŁUGI Z UMOWĄ I REKLAMACJE</h3>
        <ol>
          <li>Usługodawca ma obowiązek dostarczyć Użytkownikowi Usługę Cyfrową zgodną z Umową.</li>
          <li>Do umów o dostarczenie Usługi Cyfrowej stosuje się przepisy Rozdziału 5b ustawy o prawach konsumenta.</li>
          <li>
            Reklamacje dotyczące funkcjonowania Serwisu lub Usługi Cyfrowej należy zgłaszać pocztą elektroniczną na adres:{' '}
            <strong>prostygrafik@gmail.com</strong>.
          </li>
          <li>
            Usługodawca rozpatrzy reklamację w terminie <strong>14 dni</strong> od dnia jej otrzymania i poinformuje Użytkownika o rozstrzygnięciu
            na adres e-mail podany w zgłoszeniu.
          </li>
        </ol>
      </section>

      <section>
        <h3>§ 8. OCHRONA DANYCH OSOBOWYCH</h3>
        <ol>
          <li>Administratorem danych osobowych Użytkowników jest Usługodawca (Marcel Wojdat).</li>
          <li>
            Szczegółowe zasady przetwarzania danych osobowych oraz prawa Użytkowników zawarte są w dokumencie Polityka Prywatności,
            dostępnym w Serwisie.
          </li>
        </ol>
      </section>

      <section>
        <h3>§ 9. POSTANOWIENIA KOŃCOWE</h3>
        <ol>
          <li>
            Usługodawca zastrzega sobie prawo do zmiany niniejszego Regulaminu z ważnych przyczyn. O zmianach Użytkownicy zostaną
            poinformowani z co najmniej 14-dniowym wyprzedzeniem drogą elektroniczną.
          </li>
          <li>
            W sprawach nieuregulowanych niniejszym Regulaminem zastosowanie mają przepisy prawa polskiego, w szczególności Kodeksu cywilnego,
            Ustawy o prawach konsumenta oraz Ustawy o świadczeniu usług drogą elektroniczną.
          </li>
        </ol>
      </section>
    </p>
    <p>W razie pytań: kontakt@prostygrafik.pl</p>
  </LegalPage>
);

export const PrivacyPage = () => (
  <LegalPage title="Polityka prywatności">
    <p>
     <h1>POLITYKA PRYWATNOŚCI I PLIKÓW COOKIES</h1>
      <h2>prostygrafik.com</h2>
      <hr />

      <section>
        <h3>§ 1. POSTANOWIENIA OGÓLNE I ADMINISTRATOR DANYCH</h3>
        <ol>
          <li>
            Niniejsza Polityka Prywatności określa zasady przetwarzania i ochrony danych osobowych Użytkowników korzystających
            z serwisu internetowego znajdującego się pod adresem <strong>prostygrafik.com</strong> (zwanego dalej „Serwisem”).
          </li>
          <li>
            Administratorem danych osobowych w rozumieniu art. 4 pkt 7 Rozporządzenia Parlamentu Europejskiego i Rady (UE) 2016/679
            z dnia 27 kwietnia 2016 r. (ogólne rozporządzenie o ochronie danych – <strong>RODO</strong>) jest{' '}
            <strong>Marcel Wojdat</strong>, adres e-mail: <strong>prostygrafik@gmail.com</strong> (zwany
            dalej „Administratorem”).
          </li>
          <li>
            Administrator stosuje odpowiednie środki techniczne i organizacyjne zapewniające ochronę przetwarzanych danych osobowych
            przed ich nieuprawnionym ujawnieniem, utratą czy modyfikacją.
          </li>
        </ol>
      </section>

      <section>
        <h3>§ 2. CELE, PODSTAWY PRAWNE ORAZ OKRES PRZETWARZANIA DANYCH</h3>
        <p>Administrator przetwarza dane osobowe Użytkowników w następujących celach:</p>
        <ol>
          <li>
            <strong>Świadczenie Usługi Cyfrowej oraz prowadzenie Konta Użytkownika:</strong>
            <ul>
              <li><strong>Zakres danych:</strong> imię i nazwisko, adres e-mail, zaszyfrowane hasło, historia aktywności.</li>
              <li><strong>Podstawa prawna:</strong> art. 6 ust. 1 lit. b RODO (wykonanie umowy o świadczenie usług drogą elektroniczną).</li>
              <li><strong>Okres przechowywania:</strong> do czasu usunięcia Konta przez Użytkownika.</li>
            </ul>
          </li>
          <li>
            <strong>Realizacja płatności subskrypcyjnych i rozliczenia księgowe:</strong>
            <ul>
              <li><strong>Zakres danych:</strong> dane fakturowe (nazwa firmy, NIP, adres), historia transakcji i plany subskrypcyjne.</li>
              <li>
                <em>Uwaga: Pełne dane kart płatniczych przetwarzane są bezpośrednio przez certyfikowanego operatora płatności i nie są przechowywane na serwerze Administratora.</em>
              </li>
              <li><strong>Podstawa prawna:</strong> art. 6 ust. 1 lit. b RODO oraz art. 6 ust. 1 lit. c RODO (obowiązek prawny wynikający z przepisów podatkowych).</li>
              <li><strong>Okres przechowywania:</strong> 5 lat od końca roku kalendarzowego, w którym upłynął termin płatności podatku.</li>
            </ul>
          </li>
          <li>
            <strong>Obsługa reklamacji i kontakt z Użytkownikiem:</strong>
            <ul>
              <li><strong>Zakres danych:</strong> adres e-mail, imię, treść korespondencji.</li>
              <li><strong>Podstawa prawna:</strong> art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes Administratora).</li>
              <li><strong>Okres przechowywania:</strong> do czasu przedawnienia ewentualnych roszczeń wynikających z umowy.</li>
            </ul>
          </li>
          <li>
            <strong>Analityka i optymalizacja działania Serwisu:</strong>
            <ul>
              <li><strong>Zakres danych:</strong> adres IP, dane o przeglądarce, interakcje ze stroną.</li>
              <li><strong>Podstawa prawna:</strong> art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes polegający na poprawie działania Serwisu).</li>
              <li><strong>Okres przechowywania:</strong> do czasu wniesienia skutecznego sprzeciwu lub wygaśnięcia plików cookies.</li>
            </ul>
          </li>
        </ol>
      </section>

      <section>
        <h3>§ 3. ODBIORCY DANYCH OSOBOWYCH</h3>
        <ol>
          <li>
            Dane osobowe Użytkowników mogą być przekazywane podmiotom przetwarzającym dane na zlecenie Administratora:
            <ul>
              <li>Dostawcom usług hostingowych i serwerowych,</li>
              <li>Operatorom płatności elektronicznych (obsługującym automatyczne płatności cykliczne),</li>
              <li>Dostawcom systemów transakcyjnej wysyłki wiadomości e-mail,</li>
              <li>Podmiotom świadczącym usługi księgowe.</li>
            </ul>
          </li>
          <li>
            Wszystkie podmioty przetwarzające zapewniają odpowiednie standardy ochrony danych osobowych wymagane przez RODO.
          </li>
          <li>
            Dane nie są przekazywane do państw trzecich poza Europejski Obszar Gospodarczy (EOG) bez zachowania odpowiednich
            zabezpieczeń prawnych.
          </li>
        </ol>
      </section>

      <section>
        <h3>§ 4. PRAWA UŻYTKOWNIKA</h3>
        <p>Użytkownikowi przysługują następujące prawa wynikające z przepisów RODO:</p>
        <ul>
          <li><strong>Prawo dostępu do danych</strong> (art. 15 RODO),</li>
          <li><strong>Prawo do sprostowania danych</strong> (art. 16 RODO),</li>
          <li><strong>Prawo do usunięcia danych („prawo do bycia zapomnianym”)</strong> (art. 17 RODO),</li>
          <li><strong>Prawo do ograniczenia przetwarzania</strong> (art. 18 RODO),</li>
          <li><strong>Prawo do przenoszenia danych</strong> (art. 20 RODO),</li>
          <li><strong>Prawo do wniesienia sprzeciwu</strong> (art. 21 RODO),</li>
          <li>
            <strong>Prawo do wniesienia skargi do organu nadzorczego:</strong> Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa).
          </li>
        </ul>
        <p>
          W celu realizacji powyższych praw należy skontaktować się z Administratorem pod adresem: <strong>prostygrafik@gmail.com</strong>.
        </p>
      </section>

      <section>
        <h3>§ 5. PLIKI COOKIES I TECHNOLOGIE ŚLEDZĄCE</h3>
        <ol>
          <li>
            Serwis <strong>prostygrafik.com</strong> wykorzystuje pliki cookies (ciasteczka) w celu zapewnienia prawidłowego działania
            strony, obsługi sesji zalogowanego Użytkownika oraz analizy ruchu.
          </li>
          <li>
            Używane pliki cookies dzielą się na:
            <ul>
              <li><strong>Niezbędne:</strong> wymagane do prawidłowego funkcjonowania Serwisu i autoryzacji sesji,</li>
              <li><strong>Analityczne:</strong> pomagające analizować sposób korzystania z Serwisu w celu optymalizacji jego wydajności.</li>
            </ul>
          </li>
          <li>
            Użytkownik może w każdej chwili zmienić ustawienia dotyczące plików cookies z poziomu swojej przeglądarki internetowej.
          </li>
        </ol>
      </section>

      <section>
        <h3>§ 6. POSTANOWIENIA KOŃCOWE</h3>
        <ol>
          <li>
            Administrator zastrzega sobie prawo do wprowadzania zmian w niniejszej Polityce Prywatności w przypadku zmiany przepisów
            prawa lub modyfikacji funkcjonalności Serwisu.
          </li>
          <li>Aktualna wersja Polityki Prywatności jest zawsze dostępna w Serwisie.</li>
        </ol>
      </section>
    </p>
    <p>Kontakt w sprawie danych: kontakt@prostygrafik.pl</p>
  </LegalPage>
);