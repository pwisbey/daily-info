# Infinite Helper (무매헬퍼) Local Environment

This directory contains a complete local clone and standalone environment for **무매헬퍼 (Infinite Buying Method Helper / Backtester)**, customized to run locally without dependency on `smartdailyinfo.com`.

## Components Included

- **HTML Pages**:
  - `index.html`: Main backtest parameters and setup
  - `results.html`: Comprehensive backtest execution and result view (charts, metrics, log table, recalculation)
  - `buytable.html`: Daily buying order schedule table
  - `tax.html`: Annual and monthly profit & tax summary
  - `cycle.html`: Cycle breakdowns
  - `compare.html`: Parameter comparison curves
  - `mystart-74qz.html`: Custom state starting form
- **Styles & Scripts**:
  - `style.css`: Responsive design with dark/light theme support
  - `chart.js`: Canvas chart renderer for portfolio equity and drawdown curves
  - `site.js`: Drawer menu, navigation, and preset handlers
- **Python Backend Server**:
  - `server.py`: Lightweight Python HTTP server providing both static asset delivery and mock/proxy API handling for:
    - `/api/tickers`
    - `/api/range`
    - `/api/dates`
    - `/api/backtest`
    - `/api/compare`
    - `/api/optimize`
    - `/api/presets`, `/api/me`, `/api/health`
- **Cached Datasets**:
  - Historical ticker trading dates & ranges (`tickers.json`, `dates_soxl.json`, `dates_tqqq.json`, `range_soxl.json`, `range_tqqq.json`)
  - Full sample backtest calculations (`sample_backtest.json`, `sample_backtest_tqqq.json`, `sample_backtest_2023.json`, `sample_compare.json`, `sample_optimize.json`)

## How to Run

1. Open a terminal in `c:\Users\paul_\JsExperiments`.
2. Start the local server:
   ```bash
   python server.py
   ```
3. Open your web browser at:
   ```
   http://localhost:8000/
   ```

## Customization Notes

- All cross-subdomain operational redirects have been set to local relative files (`PROD = false`).
- Third-party tracking tags (`Google tag manager`) have been stripped.
- In `server.py`, the backtest endpoint proxies live backtest calculations if connected to the internet, and falls back seamlessly to offline cached simulation data when offline.
