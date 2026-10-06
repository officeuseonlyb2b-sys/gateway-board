import fs from 'node:fs';
const edit = (path, transform) => fs.writeFileSync(path, transform(fs.readFileSync(path, 'utf8')));
edit('src/routes/login.tsx', s => {
  s = s.replace('auth, useAuth', 'auth, useAuth, hasSupabaseConfig');
  s = s.replace('<Label htmlFor="email">Email</Label>', '<Label htmlFor="email">Employee ID / Admin Email</Label>');
  s = s.replace('type="email"', 'type="text"').replace('autoComplete="email"', 'autoComplete="username"').replace('placeholder="you@mptourism.in"', 'placeholder="EMP-0001 or admin@mptourism.in"');
  const a = s.indexOf('                <button');
  const b = s.indexOf('                </button>', a) + '                </button>'.length;
  s = s.slice(0,a) + s.slice(b);
  s = s.replace('<form onSubmit={submit}', '{!hasSupabaseConfig && <p role="alert" className="rounded-lg border border-destructive p-4 text-sm text-destructive">Cloud authentication is not configured. Contact the administrator.</p>}\n          <form onSubmit={submit}');
  s = s.replace('disabled={loading}', 'disabled={loading || !hasSupabaseConfig}');
  s = s.replace('    setLoading(false);', '    setPassword("");\n    setLoading(false);');
  s = s.replace('Access is issued individually', 'For password help, contact the administrator. Access is issued individually');
  return s;
});
edit('src/routes/_authenticated/route.tsx', s => {
  s = s.replace('beforeLoad: () => {', 'beforeLoad: async () => {').replace('if (!auth.current())', 'if (!(await auth.ready()))');
  s = s.replace('  useEffect(() => {\n    if (!user) return;\n    seedIfEmpty();', '  const userId = user?.id;\n  const isSuperAdmin = access.accountReady && access.role === "Super Admin";\n\n  useEffect(() => {\n    if (!isSuperAdmin) return;\n    seedIfEmpty();');
  s = s.replace('  }, [user]);', '  }, [isSuperAdmin]);');
  s = s.replace('    if (!user || !hasSupabaseConfig) return;\n    const stopMasters = startMastersSync();\n    const stopCrm = startCrmSync();', '    if (!userId || !hasSupabaseConfig) return;\n    const stopCrm = startCrmSync(isSuperAdmin);\n    if (!isSuperAdmin) return stopCrm;\n    const stopMasters = startMastersSync();\n    let disposed = false;');
  s = s.replace('      stopDestinations = startDestinationsSync();', '      if (!disposed) stopDestinations = startDestinationsSync();');
  s = s.replace('      stopDestinations?.();', '      disposed = true;\n      stopDestinations?.();');
  s = s.replace('  }, [user, hasSupabaseConfig]);', '  }, [userId, hasSupabaseConfig, isSuperAdmin]);');
  s = s.replace('Account access is not active', 'Account not linked / Contact Administrator');
  s = s.replace('<ActiveWizardBanner key={pathname} />', '{isSuperAdmin && <ActiveWizardBanner key={pathname} />}');
  return s;
});
edit('src/routes/index.tsx', s => s.replace('beforeLoad: () => {', 'beforeLoad: async () => {').replace('const user = auth.current();', 'const user = await auth.ready();'));
edit('src/components/AppSidebar.tsx', s => {
  s = s.replaceAll('currentRole === "Administrator"', 'currentRole === "Super Admin"');
  s = s.replace('  const roleSections =', `  const employeeSections: Section[] = [{ label: "Personal", items: [
    { label: "Home", to: "/employee-home", icon: LayoutDashboard },
    ...personalSection.items.filter((item) => item.to !== "/notifications"),
  ] }];
  const roleSections =`);
  s = s.replace('      : salesSections(currentRole) || SECTIONS;', '      : employeeSections;');
  s = s.replace('currentRole === "Super Admin" ||\n', 'currentRole === "Super Admin" ||\n');
  s = s.replace('section.roles.includes(currentRole)', 'section.roles.includes(currentRole!)').replace('item.roles.includes(currentRole)', 'item.roles.includes(currentRole!)');
  s = s.replace('label: "Team & Access"', 'label: "Employees & Login Access"');
  // Include navigation previously available only in the sales-specific menus, without duplicates.
  s = s.replace('          ...SECTIONS,', `          { label: "Administration", items: [{ label: "Admin Console", to: "/admin-console", icon: LayoutDashboard }] },
          ...SECTIONS,
          { label: "Additional Workspaces", items: [...(salesSections("Sales Manager") || []), ...(salesSections("Senior Sales Executive") || [])]
            .flatMap((section) => section.items)
            .filter((item, index, all) => item.to && !SECTIONS.some((section) => section.items.some((existing) => existing.to === item.to)) && !personalSection.items.some((personal) => personal.to === item.to) && all.findIndex((other) => other.to === item.to) === index) },`);
  return s;
});
edit('src/components/TopBar.tsx', s => s.replace('<div className="relative flex-1 max-w-xl">', '{access.role === "Super Admin" ? <div className="relative flex-1 max-w-xl">').replace('      <NotificationsDropdown />', '      : <div className="flex-1" />}\n      {access.role === "Super Admin" && <NotificationsDropdown />}').replace('{user?.email}', '{access.employee?.employee_code}'));
