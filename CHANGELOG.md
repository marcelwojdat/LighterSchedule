# Changelog

## [1.2.0](https://github.com/marcelwojdat/LighterSchedule/compare/v1.1.0...v1.2.0) (2026-11-17)


### Nowe funkcje

* **api:** manager-created accounts get an invite link instead of a password ([d8a424e](https://github.com/marcelwojdat/LighterSchedule/commit/d8a424e456d0d3ed5735ee6bdc192532351abc58))
* **auth:** page for setting the password from an invite link ([913d008](https://github.com/marcelwojdat/LighterSchedule/commit/913d0088110436df96fac006d244c180702530f6))
* **manager:** invite new accounts by link, resend invites ([22b336c](https://github.com/marcelwojdat/LighterSchedule/commit/22b336c831416c59dac3e9b9b82c3dffdfd02db2))

## [1.1.0](https://github.com/marcelwojdat/LighterSchedule/compare/v1.0.0...v1.1.0) (2026-11-17)


### Nowe funkcje

* **api:** all-or-nothing batch save of workdays ([c55be42](https://github.com/marcelwojdat/LighterSchedule/commit/c55be425a7cd449f4fa7b2e54b3226f8c2a17bf0))
* **api:** employee confirms a seen hour change ([a35332f](https://github.com/marcelwojdat/LighterSchedule/commit/a35332f6b982a7fd1fbb17118265c33b036de3aa))
* **api:** team schedule for employees (approved shifts, public fields only) ([ac393be](https://github.com/marcelwojdat/LighterSchedule/commit/ac393bedcab20a3fe0d040d0b490a90049e8b8c6))
* **auth:** one-time set-password links ([35f7836](https://github.com/marcelwojdat/LighterSchedule/commit/35f7836a40fe81cbabf4e280ca6131072f98ccaf))
* **auth:** stay signed in on public pages, 'Mój panel' link and login redirect ([70163d6](https://github.com/marcelwojdat/LighterSchedule/commit/70163d64d3e6a936ab2a53e60559d89bda3f4a17))
* **dashboard:** calendar marker for shift hours changed by the manager ([e226eeb](https://github.com/marcelwojdat/LighterSchedule/commit/e226eeb1b378e20fc3ad18a0f1be3246bf34f46a))
* **dashboard:** opening a day marks the hour change as seen ([63ef1b4](https://github.com/marcelwojdat/LighterSchedule/commit/63ef1b44af6ca7c9ebdad364ea7135190b222e48))
* **dashboard:** read-only team schedule component ([73a3cc5](https://github.com/marcelwojdat/LighterSchedule/commit/73a3cc52fe515bc6334eae3dba01e3ec9f98da30))
* **dashboard:** send declarations in one all-or-nothing request ([e8d9714](https://github.com/marcelwojdat/LighterSchedule/commit/e8d9714ea75b29f1e811a0cd13d9de8710a83a60))
* **dashboard:** show previous and new hours in the day popup ([887693e](https://github.com/marcelwojdat/LighterSchedule/commit/887693e4697caddf385117bfe8135e0cd17875d5))
* **dashboard:** show the team schedule to employees ([853c83c](https://github.com/marcelwojdat/LighterSchedule/commit/853c83c8482c927609549878470f9d9c75a04038))
* **email:** notify employees about changed shift hours after commit ([9c6d858](https://github.com/marcelwojdat/LighterSchedule/commit/9c6d85872bf33d8c3f6d566f0c034fc4620900d7))
* **manager:** day popup with shift list, free places and own hours ([07407c7](https://github.com/marcelwojdat/LighterSchedule/commit/07407c7d10ca144124283725e2b18a428bd001f6))
* **manager:** edit days in a popup like the employee panel ([fc6d001](https://github.com/marcelwojdat/LighterSchedule/commit/fc6d001721d20fc043d90b7f90df99d2216d3abc))
* **manager:** managers can plan their own shifts ('Mój grafik') ([1ad0260](https://github.com/marcelwojdat/LighterSchedule/commit/1ad026042864aff8332764992db5b84eff018ea3))
* **manager:** save an employee's schedule in one all-or-nothing request ([fdc328d](https://github.com/marcelwojdat/LighterSchedule/commit/fdc328dc2b721847aa94cbc06ac8d1b5d9b5da2e))
* **manager:** setting to show or hide the team schedule from employees ([8bccd20](https://github.com/marcelwojdat/LighterSchedule/commit/8bccd20860d4ee688598607b5bec71967a6234e7))
* **manager:** toggles for hour-change notice and e-mail ([a47050b](https://github.com/marcelwojdat/LighterSchedule/commit/a47050b3c4186ddbdf649fae11ba1914cf77f894))
* **release:** automated releases with release-please, GHCR images and SSH deploy with rollback ([39b4099](https://github.com/marcelwojdat/LighterSchedule/commit/39b4099e66d9fc1bc486020d350e2f94df21ec7a))
* **schedule:** hour-change notice for employees; settings toggles in API ([a86f304](https://github.com/marcelwojdat/LighterSchedule/commit/a86f3042e2986db1aabb94ac12d0fb6dfe4959ce))
* **schedule:** record manager hour changes on every save path ([1676d27](https://github.com/marcelwojdat/LighterSchedule/commit/1676d27bf28d6927222bdfd83816287d1b4e97c1))
* **schedule:** track manager hour changes on workdays; notification settings ([a63f65e](https://github.com/marcelwojdat/LighterSchedule/commit/a63f65ef69d8dcd0dacda8976d2ae6f06274a2d1))
* **ui:** home page link in user menu; tests for login redirect ([4df75ad](https://github.com/marcelwojdat/LighterSchedule/commit/4df75ad4d7901a476d77b5e3da54dac209cf1aa1))
* **ui:** hook warning before leaving the page with unsaved changes ([95d6eee](https://github.com/marcelwojdat/LighterSchedule/commit/95d6eee536ff6fad512f6cbbf6e48959b1953b1b))
* **ui:** notices disappear one after another instead of all at once ([1760ab1](https://github.com/marcelwojdat/LighterSchedule/commit/1760ab1fb129c4c4e93297ff3b2d4466872befa5))
* **ui:** warn before leaving with unsaved schedule drafts ([70a6609](https://github.com/marcelwojdat/LighterSchedule/commit/70a6609b6e5b0580da7aa50272a01b31e8d6e0db))


### Poprawki

* **api:** batch save approves manager edits of pending/rejected days; e-mail after commit ([af6169b](https://github.com/marcelwojdat/LighterSchedule/commit/af6169bdea4ec60d0ab136912c63f07f556daa3f))
* **auth:** lowercase usernames on sign-up, case-insensitive login ([54354fa](https://github.com/marcelwojdat/LighterSchedule/commit/54354fab54c5c1f4371c89db3da2660b06293521))
