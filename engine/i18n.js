/**
 * SplitGasto 2026 — Sistema de Internacionalización (i18n)
 * Archivo compartido: carga en TODAS las páginas con:
 * <script src="engine/i18n.js" defer></script>
 *
 * API pública:
 *   t(key, lang?, fallback?)  → string traducido
 *   applyTranslations(lang)   → aplica data-i18n al DOM
 *   getSavedLanguage()        → string idioma ('es'|'en'|'fr'|'de'|'zh'|'ja')
 *   getSavedCurrency()        → string moneda ('EUR'|'USD'|...)
 */

const translations = {
  es: {
    'settings.title': 'Configuración',
    'settings.edit': 'Editar',
    'settings.ai': 'Inteligencia Artificial',
    'settings.aiVersion': 'Versión 2.6 · En línea',
    'settings.aiConfidence': 'Confianza media del escáner',
    'badge.active': 'Activo',
    'settings.notifications': 'Notificaciones',
    'settings.language': 'Idioma y Región',
    'settings.currency': 'Moneda por defecto',
    'settings.privacy': 'Privacidad y Seguridad',
    'settings.terms': 'Términos y Privacidad',
    'settings.appearance': 'Apariencia',
    'settings.darkModeAlways': 'Negro puro · Siempre activo',
    'settings.dangerZone': 'Zona de Riesgo',
    'settings.logout': 'Cerrar Sesión',
    'settings.deleteAccount': 'Eliminar Cuenta',
    'nav.dashboard': 'Mando',
    'nav.groups': 'Grupos',
    'nav.expenses': 'Gastos',
    'nav.metrics': 'Métricas',
    'nav.profile': 'Perfil',
    'toggle.on': 'Activado',
    'toggle.off': 'Desactivado',
    'role.admin': 'Administrador',
    'role.member': 'Socio',
    'role.founder': 'Socio · Fundador',
    'settings.aiEngine': 'Motor IA Alpha',
    'settings.aiOcr': 'OCR Inteligente',
    'settings.aiOcrSub': 'Extracción automática de tickets',
    'settings.aiSuggest': 'Sugerencias de Reparto',
    'settings.aiSuggestSub': 'IA recomienda el split óptimo',
    'settings.aiTranslate': 'Traducción en Tiempo Real',
    'settings.aiTranslateSub': 'Tickets en otro idioma',
    'settings.aiLearn': 'Aprendizaje Personalizado',
    'settings.aiLearnSub': 'La IA aprende tus hábitos',
    'settings.notifPush': 'Notificaciones Push',
    'settings.notifPushSub': 'Pagos, deudas y actividad',
    'settings.notifPay': 'Recordatorios de Pago',
    'settings.notifPaySub': 'Avisos antes del vencimiento',
    'settings.notifGame': 'Alertas de Juego',
    'settings.notifGameSub': 'Resultados y torneos',
    'settings.security': 'Seguridad Alpha',
    'settings.securitySub': 'Biometría, 2FA, AES-256',
    'settings.analytics': 'Analytics Anónimas',
    'settings.analyticsSub': 'Ayuda a mejorar la app',
    'settings.darkMode': 'Modo Oscuro AMOLED',
    'settings.manual': 'Manual Alpha',
    'settings.manualSub': 'Guía completa del sistema',
    'settings.version': 'Alfa v2.6.0 · Compilación 2026.06.02',
    'settings.versionSub': 'Motor IA v2.6 · AES-256 · Extremo a Extremo',
    /* ── dashboard ── */
    'dashboard.netWorth': 'Patrimonio Neto Auditado',
    'dashboard.liquidations': 'Liquidaciones',
    'dashboard.toReceive': 'A Recibir',
    'dashboard.btnLiquidate': 'Liquidar',
    'dashboard.btnSplit': 'Repartir',
    'dashboard.scanner': 'Scanner',
    'dashboard.groups': 'Grupos',
    'dashboard.vault': 'Bóveda',
    'dashboard.metrics': 'Métricas',
    'dashboard.games': 'Juegos',
    'dashboard.expense': 'Gasto',
    'dashboard.recentActivity': 'Actividad Reciente',
    'dashboard.viewAll': 'Ver todo',
    'dashboard.noGroups': 'Sin grupos',
    'dashboard.createFirstGroup': 'Crea tu primer grupo',
    /* ── activity / expenses ── */
    'activity.loading': 'Cargando actividad…',
    'activity.empty': 'Sin actividad. Crea un grupo y añade gastos.',
    'activity.noExpenses': 'Sin gastos todavía. ¡Añade el primero!',
    /* ── group ── */
    'group.member': 'Socio',
    'group.members': 'Socios',
    /* ── debts ── */
    'debts.none': 'No tienes deudas pendientes',
    /* ── common ── */
    'common.cancel': 'Cancelar',
    'common.loading': 'Cargando…',
    /* ── auth ── */
    'auth.logoutSuccess': 'Sesión cerrada',
    /* ── account ── */
    'account.deleteContactSupport': 'Para eliminar la cuenta, contacta soporte',
    /* ── settings (inline JS) ── */
    'settings.selectCurrency': 'Selecciona moneda',
    /* ── error ── */
    'error.system': 'Error al cargar',
    /* ── index (landing) ── */
    'index.heroTitleHtml': 'Divide gastos,<br><em>multiplica momentos.</em>',
    'index.heroSub': 'SplitGasto divide cuentas entre amigos en segundos. Escanea el ticket, elige quién paga con un juego, y liquida sin drama.',
    'index.ctaPrimary': 'Crear cuenta — es gratis',
    'index.ctaSecondary': 'Ya tengo cuenta →',
  },
  en: {
    'settings.title': 'Settings',
    'settings.edit': 'Edit',
    'settings.ai': 'Artificial Intelligence',
    'settings.aiVersion': 'Version 2.6 · Online',
    'settings.aiConfidence': 'Average scanner confidence',
    'badge.active': 'Active',
    'settings.notifications': 'Notifications',
    'settings.language': 'Language & Region',
    'settings.currency': 'Default currency',
    'settings.privacy': 'Privacy & Security',
    'settings.terms': 'Terms & Privacy',
    'settings.appearance': 'Appearance',
    'settings.darkModeAlways': 'Pure black · Always on',
    'settings.dangerZone': 'Danger Zone',
    'settings.logout': 'Log Out',
    'settings.deleteAccount': 'Delete Account',
    'nav.dashboard': 'Dashboard',
    'nav.groups': 'Groups',
    'nav.expenses': 'Expenses',
    'nav.metrics': 'Metrics',
    'nav.profile': 'Profile',
    'toggle.on': 'Enabled',
    'toggle.off': 'Disabled',
    'role.admin': 'Admin',
    'role.member': 'Member',
    'role.founder': 'Co-founder',
    'settings.aiEngine': 'AI Engine Alpha',
    'settings.aiOcr': 'Smart OCR',
    'settings.aiOcrSub': 'Automatic receipt extraction',
    'settings.aiSuggest': 'Split Suggestions',
    'settings.aiSuggestSub': 'AI recommends optimal split',
    'settings.aiTranslate': 'Real-Time Translation',
    'settings.aiTranslateSub': 'Receipts in other languages',
    'settings.aiLearn': 'Personalised Learning',
    'settings.aiLearnSub': 'AI learns your habits',
    'settings.notifPush': 'Push Notifications',
    'settings.notifPushSub': 'Payments, debts and activity',
    'settings.notifPay': 'Payment Reminders',
    'settings.notifPaySub': 'Alerts before due date',
    'settings.notifGame': 'Game Alerts',
    'settings.notifGameSub': 'Results and tournaments',
    'settings.security': 'Security Alpha',
    'settings.securitySub': 'Biometrics, 2FA, AES-256',
    'settings.analytics': 'Anonymous Analytics',
    'settings.analyticsSub': 'Help improve the app',
    'settings.darkMode': 'AMOLED Dark Mode',
    'settings.manual': 'Alpha Manual',
    'settings.manualSub': 'Complete system guide',
    'settings.version': 'Alpha v2.6.0 · Build 2026.06.02',
    'settings.versionSub': 'AI Engine v2.6 · AES-256 · End-to-End',
    /* ── dashboard ── */
    'dashboard.netWorth': 'Audited Net Worth',
    'dashboard.liquidations': 'Settlements',
    'dashboard.toReceive': 'To Receive',
    'dashboard.btnLiquidate': 'Settle',
    'dashboard.btnSplit': 'Split',
    'dashboard.scanner': 'Scanner',
    'dashboard.groups': 'Groups',
    'dashboard.vault': 'Vault',
    'dashboard.metrics': 'Metrics',
    'dashboard.games': 'Games',
    'dashboard.expense': 'Expense',
    'dashboard.recentActivity': 'Recent Activity',
    'dashboard.viewAll': 'View all',
    'dashboard.noGroups': 'No groups',
    'dashboard.createFirstGroup': 'Create your first group',
    /* ── activity ── */
    'activity.loading': 'Loading activity…',
    'activity.empty': 'No activity. Create a group and add expenses.',
    'activity.noExpenses': 'No expenses yet. Add the first one!',
    /* ── group ── */
    'group.member': 'Member',
    'group.members': 'Members',
    /* ── debts ── */
    'debts.none': 'You have no pending debts',
    /* ── common ── */
    'common.cancel': 'Cancel',
    'common.loading': 'Loading…',
    /* ── auth ── */
    'auth.logoutSuccess': 'Logged out',
    /* ── account ── */
    'account.deleteContactSupport': 'To delete your account, contact support',
    /* ── settings (inline JS) ── */
    'settings.selectCurrency': 'Select currency',
    /* ── error ── */
    'error.system': 'Failed to load',
    /* ── index (landing) ── */
    'index.heroTitleHtml': 'Split expenses,<br><em>multiply moments.</em>',
    'index.heroSub': 'SplitGasto splits bills between friends in seconds. Scan the receipt, choose who pays with a game, and settle without drama.',
    'index.ctaPrimary': 'Create account — it\'s free',
    'index.ctaSecondary': 'I already have an account →',
  },
  fr: {
    'settings.title': 'Paramètres',
    'settings.edit': 'Modifier',
    'settings.ai': 'Intelligence Artificielle',
    'settings.aiVersion': 'Version 2.6 · En ligne',
    'settings.aiConfidence': 'Confiance moyenne du scanner',
    'badge.active': 'Actif',
    'settings.notifications': 'Notifications',
    'settings.language': 'Langue et Région',
    'settings.currency': 'Devise par défaut',
    'settings.privacy': 'Confidentialité et Sécurité',
    'settings.terms': 'Conditions et Confidentialité',
    'settings.appearance': 'Apparence',
    'settings.darkModeAlways': 'Noir pur · Toujours actif',
    'settings.dangerZone': 'Zone à Risque',
    'settings.logout': 'Déconnexion',
    'settings.deleteAccount': 'Supprimer le Compte',
    'nav.dashboard': 'Tableau',
    'nav.groups': 'Groupes',
    'nav.expenses': 'Dépenses',
    'nav.metrics': 'Métriques',
    'nav.profile': 'Profil',
    'toggle.on': 'Activé',
    'toggle.off': 'Désactivé',
    'role.admin': 'Administrateur',
    'role.member': 'Membre',
    'role.founder': 'Cofondateur',
    'settings.aiEngine': 'Moteur IA Alpha',
    'settings.aiOcr': 'OCR Intelligent',
    'settings.aiOcrSub': 'Extraction automatique des tickets',
    'settings.aiSuggest': 'Suggestions de Partage',
    'settings.aiSuggestSub': "L'IA recommande le split optimal",
    'settings.aiTranslate': 'Traduction en Temps Réel',
    'settings.aiTranslateSub': 'Tickets dans une autre langue',
    'settings.aiLearn': 'Apprentissage Personnalisé',
    'settings.aiLearnSub': "L'IA apprend vos habitudes",
    'settings.notifPush': 'Notifications Push',
    'settings.notifPushSub': 'Paiements, dettes et activité',
    'settings.notifPay': 'Rappels de Paiement',
    'settings.notifPaySub': "Alertes avant l'échéance",
    'settings.notifGame': 'Alertes de Jeu',
    'settings.notifGameSub': 'Résultats et tournois',
    'settings.security': 'Sécurité Alpha',
    'settings.securitySub': 'Biométrie, 2FA, AES-256',
    'settings.analytics': 'Analyses Anonymes',
    'settings.analyticsSub': "Aide à l'amélioration de l'app",
    'settings.darkMode': 'Mode Sombre AMOLED',
    'settings.manual': 'Manuel Alpha',
    'settings.manualSub': 'Guide complet du système',
    'settings.version': 'Alpha v2.6.0 · Build 2026.06.02',
    'settings.versionSub': 'Moteur IA v2.6 · AES-256 · Bout en Bout',
    /* ── dashboard ── */
    'dashboard.netWorth': 'Patrimoine Net Audité',
    'dashboard.liquidations': 'Règlements',
    'dashboard.toReceive': 'À Recevoir',
    'dashboard.btnLiquidate': 'Régler',
    'dashboard.btnSplit': 'Partager',
    'dashboard.scanner': 'Scanner',
    'dashboard.groups': 'Groupes',
    'dashboard.vault': 'Coffre',
    'dashboard.metrics': 'Métriques',
    'dashboard.games': 'Jeux',
    'dashboard.expense': 'Dépense',
    'dashboard.recentActivity': 'Activité Récente',
    'dashboard.viewAll': 'Voir tout',
    'dashboard.noGroups': 'Aucun groupe',
    'dashboard.createFirstGroup': 'Créez votre premier groupe',
    /* ── activity ── */
    'activity.loading': 'Chargement…',
    'activity.empty': 'Aucune activité. Créez un groupe et ajoutez des dépenses.',
    'activity.noExpenses': "Pas encore de dépenses. Ajoutez la première !",
    /* ── group ── */
    'group.member': 'Membre',
    'group.members': 'Membres',
    /* ── debts ── */
    'debts.none': "Vous n'avez aucune dette en cours",
    /* ── common ── */
    'common.cancel': 'Annuler',
    'common.loading': 'Chargement…',
    /* ── auth ── */
    'auth.logoutSuccess': 'Déconnexion réussie',
    /* ── account ── */
    'account.deleteContactSupport': 'Pour supprimer votre compte, contactez le support',
    /* ── settings (inline JS) ── */
    'settings.selectCurrency': 'Sélectionner la devise',
    /* ── error ── */
    'error.system': 'Échec du chargement',
    /* ── index (landing) ── */
    'index.heroTitleHtml': 'Divisez les dépenses,<br><em>multipliez les moments.</em>',
    'index.heroSub': 'SplitGasto divise les factures entre amis en quelques secondes. Scannez le ticket, choisissez qui paie avec un jeu, et réglez sans drame.',
    'index.ctaPrimary': 'Créer un compte — c\'est gratuit',
    'index.ctaSecondary': "J'ai déjà un compte →",
  },
  de: {
    'settings.title': 'Einstellungen',
    'settings.edit': 'Bearbeiten',
    'settings.ai': 'Künstliche Intelligenz',
    'settings.aiVersion': 'Version 2.6 · Online',
    'settings.aiConfidence': 'Durchschnittliche Scanner-Konfidenz',
    'badge.active': 'Aktiv',
    'settings.notifications': 'Benachrichtigungen',
    'settings.language': 'Sprache & Region',
    'settings.currency': 'Standardwährung',
    'settings.privacy': 'Datenschutz & Sicherheit',
    'settings.terms': 'AGB & Datenschutz',
    'settings.appearance': 'Erscheinungsbild',
    'settings.darkModeAlways': 'Rein schwarz · Immer aktiv',
    'settings.dangerZone': 'Gefahrenzone',
    'settings.logout': 'Abmelden',
    'settings.deleteAccount': 'Konto löschen',
    'nav.dashboard': 'Dashboard',
    'nav.groups': 'Gruppen',
    'nav.expenses': 'Ausgaben',
    'nav.metrics': 'Metriken',
    'nav.profile': 'Profil',
    'toggle.on': 'Aktiviert',
    'toggle.off': 'Deaktiviert',
    'role.admin': 'Administrator',
    'role.member': 'Mitglied',
    'role.founder': 'Mitgründer',
    'settings.aiEngine': 'KI-Motor Alpha',
    'settings.aiOcr': 'Intelligentes OCR',
    'settings.aiOcrSub': 'Automatische Belegextraktion',
    'settings.aiSuggest': 'Teilungsvorschläge',
    'settings.aiSuggestSub': 'KI empfiehlt optimale Aufteilung',
    'settings.aiTranslate': 'Echtzeit-Übersetzung',
    'settings.aiTranslateSub': 'Belege in anderen Sprachen',
    'settings.aiLearn': 'Personalisiertes Lernen',
    'settings.aiLearnSub': 'KI lernt Ihre Gewohnheiten',
    'settings.notifPush': 'Push-Benachrichtigungen',
    'settings.notifPushSub': 'Zahlungen, Schulden und Aktivität',
    'settings.notifPay': 'Zahlungserinnerungen',
    'settings.notifPaySub': 'Hinweise vor Fälligkeit',
    'settings.notifGame': 'Spielbenachrichtigungen',
    'settings.notifGameSub': 'Ergebnisse und Turniere',
    'settings.security': 'Sicherheit Alpha',
    'settings.securitySub': 'Biometrie, 2FA, AES-256',
    'settings.analytics': 'Anonyme Analysen',
    'settings.analyticsSub': 'Hilft, die App zu verbessern',
    'settings.darkMode': 'AMOLED-Dunkelmodus',
    'settings.manual': 'Alpha-Handbuch',
    'settings.manualSub': 'Vollständige Systemanleitung',
    'settings.version': 'Alpha v2.6.0 · Build 2026.06.02',
    'settings.versionSub': 'KI-Motor v2.6 · AES-256 · Ende-zu-Ende',
    /* ── dashboard ── */
    'dashboard.netWorth': 'Geprüftes Nettovermögen',
    'dashboard.liquidations': 'Abrechnungen',
    'dashboard.toReceive': 'Zu erhalten',
    'dashboard.btnLiquidate': 'Abrechnen',
    'dashboard.btnSplit': 'Aufteilen',
    'dashboard.scanner': 'Scanner',
    'dashboard.groups': 'Gruppen',
    'dashboard.vault': 'Tresor',
    'dashboard.metrics': 'Metriken',
    'dashboard.games': 'Spiele',
    'dashboard.expense': 'Ausgabe',
    'dashboard.recentActivity': 'Neueste Aktivität',
    'dashboard.viewAll': 'Alle anzeigen',
    'dashboard.noGroups': 'Keine Gruppen',
    'dashboard.createFirstGroup': 'Erstelle deine erste Gruppe',
    /* ── activity ── */
    'activity.loading': 'Wird geladen…',
    'activity.empty': 'Keine Aktivität. Erstelle eine Gruppe und füge Ausgaben hinzu.',
    'activity.noExpenses': 'Noch keine Ausgaben. Füge die erste hinzu!',
    /* ── group ── */
    'group.member': 'Mitglied',
    'group.members': 'Mitglieder',
    /* ── debts ── */
    'debts.none': 'Keine ausstehenden Schulden',
    /* ── common ── */
    'common.cancel': 'Abbrechen',
    'common.loading': 'Wird geladen…',
    /* ── auth ── */
    'auth.logoutSuccess': 'Abgemeldet',
    /* ── account ── */
    'account.deleteContactSupport': 'Zum Löschen des Kontos Support kontaktieren',
    /* ── settings (inline JS) ── */
    'settings.selectCurrency': 'Währung auswählen',
    /* ── error ── */
    'error.system': 'Ladefehler',
    /* ── index (landing) ── */
    'index.heroTitleHtml': 'Ausgaben teilen,<br><em>Momente vervielfachen.</em>',
    'index.heroSub': 'SplitGasto teilt Rechnungen zwischen Freunden in Sekunden. Scanne den Beleg, wähle wer zahlt mit einem Spiel, und kläre ohne Drama.',
    'index.ctaPrimary': 'Konto erstellen — kostenlos',
    'index.ctaSecondary': 'Ich habe bereits ein Konto →',
  },
  zh: {
    'settings.title': '设置',
    'settings.edit': '编辑',
    'settings.ai': '人工智能',
    'settings.aiVersion': '版本 2.6 · 在线',
    'badge.active': '活跃',
    'settings.notifications': '通知',
    'settings.language': '语言和地区',
    'settings.currency': '默认货币',
    'settings.privacy': '隐私与安全',
    'settings.terms': '条款与隐私',
    'settings.appearance': '外观',
    'settings.darkModeAlways': '纯黑 · 始终开启',
    'settings.dangerZone': '危险区域',
    'settings.logout': '退出登录',
    'settings.deleteAccount': '删除账户',
    'nav.dashboard': '仪表盘',
    'nav.groups': '群组',
    'nav.expenses': '支出',
    'nav.metrics': '指标',
    'nav.profile': '个人',
    'toggle.on': '已启用',
    'toggle.off': '已禁用',
    'role.admin': '管理员',
    'role.member': '成员',
    'role.founder': '联合创始人',
    'settings.aiEngine': 'AI引擎 Alpha',
    'settings.aiOcr': '智能OCR',
    'settings.aiOcrSub': '自动提取票据',
    'settings.aiSuggest': '分摊建议',
    'settings.aiSuggestSub': 'AI推荐最优分摊',
    'settings.aiTranslate': '实时翻译',
    'settings.aiTranslateSub': '其他语言的票据',
    'settings.aiLearn': '个性化学习',
    'settings.aiLearnSub': 'AI学习您的习惯',
    'settings.notifPush': '推送通知',
    'settings.notifPushSub': '付款、债务和活动',
    'settings.notifPay': '付款提醒',
    'settings.notifPaySub': '到期前提醒',
    'settings.notifGame': '游戏提醒',
    'settings.notifGameSub': '结果和比赛',
    'settings.security': '安全 Alpha',
    'settings.securitySub': '生物识别、2FA、AES-256',
    'settings.analytics': '匿名分析',
    'settings.analyticsSub': '帮助改进应用',
    'settings.darkMode': 'AMOLED深色模式',
    'settings.manual': 'Alpha 手册',
    'settings.manualSub': '完整系统指南',
    'settings.version': 'Alpha v2.6.0 · 版本 2026.06.02',
    'settings.versionSub': 'AI引擎 v2.6 · AES-256 · 端到端',
    /* ── dashboard ── */
    'dashboard.netWorth': '经审计净资产',
    'dashboard.liquidations': '结算',
    'dashboard.toReceive': '待收',
    'dashboard.btnLiquidate': '结算',
    'dashboard.btnSplit': '分摊',
    'dashboard.scanner': '扫描仪',
    'dashboard.groups': '群组',
    'dashboard.vault': '保险库',
    'dashboard.metrics': '指标',
    'dashboard.games': '游戏',
    'dashboard.expense': '支出',
    'dashboard.recentActivity': '最近活动',
    'dashboard.viewAll': '查看全部',
    'dashboard.noGroups': '暂无群组',
    'dashboard.createFirstGroup': '创建您的第一个群组',
    /* ── activity ── */
    'activity.loading': '加载中…',
    'activity.empty': '暂无活动。创建群组并添加支出。',
    'activity.noExpenses': '暂无支出。添加第一笔吧！',
    /* ── group ── */
    'group.member': '成员',
    'group.members': '成员',
    /* ── debts ── */
    'debts.none': '您没有待处理的债务',
    /* ── common ── */
    'common.cancel': '取消',
    'common.loading': '加载中…',
    /* ── auth ── */
    'auth.logoutSuccess': '已退出登录',
    /* ── account ── */
    'account.deleteContactSupport': '如需删除账户，请联系支持',
    /* ── settings (inline JS) ── */
    'settings.selectCurrency': '选择货币',
    /* ── error ── */
    'error.system': '加载失败',
    /* ── index (landing) ── */
    'index.heroTitleHtml': '分摊支出，<br><em>倍增时光。</em>',
    'index.heroSub': 'SplitGasto 几秒钟内在朋友之间分摊账单。扫描收据，用游戏决定谁付款，轻松结清。',
    'index.ctaPrimary': '创建账户 — 免费',
    'index.ctaSecondary': '我已有账户 →',
  },
  ja: {
    'settings.title': '設定',
    'settings.edit': '編集',
    'settings.ai': '人工知能',
    'settings.aiVersion': 'バージョン 2.6 · オンライン',
    'badge.active': 'アクティブ',
    'settings.notifications': '通知',
    'settings.language': '言語と地域',
    'settings.currency': 'デフォルト通貨',
    'settings.privacy': 'プライバシーとセキュリティ',
    'settings.terms': '利用規約とプライバシー',
    'settings.appearance': '外観',
    'settings.darkModeAlways': 'ピュアブラック · 常時オン',
    'settings.dangerZone': '危険ゾーン',
    'settings.logout': 'ログアウト',
    'settings.deleteAccount': 'アカウント削除',
    'nav.dashboard': 'ダッシュボード',
    'nav.groups': 'グループ',
    'nav.expenses': '支出',
    'nav.metrics': 'メトリクス',
    'nav.profile': 'プロフィール',
    'toggle.on': '有効',
    'toggle.off': '無効',
    'role.admin': '管理者',
    'role.member': 'メンバー',
    'role.founder': '共同創設者',
    'settings.aiEngine': 'AIエンジン Alpha',
    'settings.aiOcr': 'スマートOCR',
    'settings.aiOcrSub': '自動レシート抽出',
    'settings.aiSuggest': '分割提案',
    'settings.aiSuggestSub': 'AIが最適な分割を推奨',
    'settings.aiTranslate': 'リアルタイム翻訳',
    'settings.aiTranslateSub': '他言語のレシート',
    'settings.aiLearn': 'パーソナライズ学習',
    'settings.aiLearnSub': 'AIがあなたの習慣を学習',
    'settings.notifPush': 'プッシュ通知',
    'settings.notifPushSub': '支払い、負債、アクティビティ',
    'settings.notifPay': '支払いリマインダー',
    'settings.notifPaySub': '期日前のアラート',
    'settings.notifGame': 'ゲームアラート',
    'settings.notifGameSub': '結果とトーナメント',
    'settings.security': 'セキュリティ Alpha',
    'settings.securitySub': '生体認証、2FA、AES-256',
    'settings.analytics': '匿名分析',
    'settings.analyticsSub': 'アプリ改善に貢献',
    'settings.darkMode': 'AMOLED ダークモード',
    'settings.manual': 'Alpha マニュアル',
    'settings.manualSub': '完全なシステムガイド',
    'settings.version': 'Alpha v2.6.0 · ビルド 2026.06.02',
    'settings.versionSub': 'AIエンジン v2.6 · AES-256 · エンドツーエンド',
    /* ── dashboard ── */
    'dashboard.netWorth': '監査済み純資産',
    'dashboard.liquidations': '精算',
    'dashboard.toReceive': '受取予定',
    'dashboard.btnLiquidate': '精算する',
    'dashboard.btnSplit': '割り勘',
    'dashboard.scanner': 'スキャナー',
    'dashboard.groups': 'グループ',
    'dashboard.vault': '金庫',
    'dashboard.metrics': 'メトリクス',
    'dashboard.games': 'ゲーム',
    'dashboard.expense': '支出',
    'dashboard.recentActivity': '最近のアクティビティ',
    'dashboard.viewAll': 'すべて見る',
    'dashboard.noGroups': 'グループなし',
    'dashboard.createFirstGroup': '最初のグループを作成',
    /* ── activity ── */
    'activity.loading': '読み込み中…',
    'activity.empty': 'アクティビティなし。グループを作成して支出を追加してください。',
    'activity.noExpenses': 'まだ支出がありません。最初の支出を追加しましょう！',
    /* ── group ── */
    'group.member': 'メンバー',
    'group.members': 'メンバー',
    /* ── debts ── */
    'debts.none': '未払いの負債はありません',
    /* ── common ── */
    'common.cancel': 'キャンセル',
    'common.loading': '読み込み中…',
    /* ── auth ── */
    'auth.logoutSuccess': 'ログアウトしました',
    /* ── account ── */
    'account.deleteContactSupport': 'アカウントを削除するにはサポートにお問い合わせください',
    /* ── settings (inline JS) ── */
    'settings.selectCurrency': '通貨を選択',
    /* ── error ── */
    'error.system': '読み込みエラー',
    /* ── index (landing) ── */
    'index.heroTitleHtml': '費用を分割し、<br><em>思い出を増やそう。</em>',
    'index.heroSub': 'SplitGastoは数秒で友人間の請求を分割します。レシートをスキャンして、ゲームで誰が支払うか決め、面倒なくきれいに精算。',
    'index.ctaPrimary': 'アカウント作成 — 無料',
    'index.ctaSecondary': 'すでにアカウントをお持ちの方 →',
  }
};

/**
 * Aplica las traducciones al DOM actual.
 * Busca todos los elementos con [data-i18n] y reemplaza su contenido.
 * Regla de seguridad:
 *   - Claves que terminan en "Html" → innerHTML (permite <br>, <em>, etc.)
 *   - Resto → textContent (no inyecta HTML arbitrario — seguro)
 */
function applyTranslations(lang) {
  const dict = translations[lang] || translations['es'];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (!dict[key]) return;
    if (key.endsWith('Html')) {
      el.innerHTML = dict[key];
    } else {
      el.textContent = dict[key];
    }
  });
  document.documentElement.lang = lang;
}

/**
 * Devuelve el idioma guardado o 'es' por defecto.
 */
function getSavedLanguage() {
  return localStorage.getItem('sg_lang') || 'es';
}

/**
 * Devuelve la moneda guardada o 'EUR' por defecto.
 * Usar en api.js cuando no se pase currency explícito.
 */
function getSavedCurrency() {
  return localStorage.getItem('sg_currency') || 'EUR';
}

/**
 * Función imperativa para textos generados desde JS.
 * Uso: t('dashboard.noGroups', null, 'Sin grupos')
 * @param {string} key     - Clave de traducción
 * @param {string} [lang]  - Idioma (si null, usa getSavedLanguage())
 * @param {string} [fallback] - Texto de reserva si la clave no existe
 * @returns {string}
 */
function t(key, lang, fallback) {
  const l = lang || getSavedLanguage();
  const dict = translations[l] || translations['es'];
  return dict[key] || fallback || key;
}

/**
 * Auto-aplicar idioma en cada página al cargar.
 */
document.addEventListener('DOMContentLoaded', () => {
  const savedLang = getSavedLanguage();
  applyTranslations(savedLang);
});

/* ── Exports globales (accesibles desde cualquier <script> inline) ── */
window.t                  = t;
window.applyTranslations  = applyTranslations;
window.getSavedLanguage   = getSavedLanguage;
window.getSavedCurrency   = getSavedCurrency;
