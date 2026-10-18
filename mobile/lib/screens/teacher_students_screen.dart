import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/auth_service.dart';
import '../core/i18n.dart';
import '../core/validation_store.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'validation_screen.dart';

/// Les élèves qu'un enseignant (ou un administratif) peut valider dans un établissement :
/// l'enseignant ne voit que les élèves de SES classes (le serveur filtre).
class TeacherStudentsScreen extends StatefulWidget {
  const TeacherStudentsScreen({super.key, required this.orgId, required this.orgName});
  final String orgId, orgName;

  @override
  State<TeacherStudentsScreen> createState() => _TeacherStudentsScreenState();
}

class _TeacherStudentsScreenState extends State<TeacherStudentsScreen> {
  late Future<List<StudentRef>> _students = _load();
  String _q = '';

  Future<List<StudentRef>> _load() async {
    final r = await context.read<AuthService>().api!.get('/orgs/${widget.orgId}/students') as Map<String, dynamic>;
    return [for (final s in (r['students'] as List)) StudentRef.fromJson(s as Map<String, dynamic>)];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.orgName)),
      body: SafeArea(
        child: Constrained(
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: TextField(
                decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: tr('Rechercher un élève'), isDense: true),
                onChanged: (v) => setState(() => _q = v.trim()),
              ),
            ),
            Expanded(
              child: FutureBuilder<List<StudentRef>>(
                future: _students,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
                  if (snap.hasError) {
                    final msg = snap.error is ApiException ? (snap.error as ApiException).message : tr('Chargement impossible. Réessayez.');
                    return EmptyState(
                      icon: Icons.error_outline,
                      title: msg,
                      action: FilledButton(onPressed: () => setState(() => _students = _load()), child: Text(tr('Réessayer'))),
                    );
                  }
                  final list = snap.data!.where((s) => _q.isEmpty || s.fullName.contains(_q) || s.fatherName.contains(_q)).toList();
                  if (list.isEmpty) {
                    return EmptyState(
                      icon: Icons.groups_outlined,
                      title: tr('Aucun élève'),
                      body: tr('Les élèves de vos classes apparaissent ici.'),
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    itemCount: list.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, i) {
                      final s = list[i];
                      final sub = [if (s.fatherName.isNotEmpty) s.fatherName, if (s.age != null) tr('{n} ans', {'n': s.age}), ...s.classes].join(' · ');
                      return Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: context.colors.primary.withValues(alpha: 0.12),
                            child: Icon(Icons.person_outline, color: context.colors.primary),
                          ),
                          title: Text(s.fullName),
                          subtitle: sub.isEmpty ? null : Text(sub),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ValidationScreen(orgId: widget.orgId, student: s))),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
