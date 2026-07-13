WITH
structural_namespaces AS (
  SELECT n.oid, n.nspname, n.nspowner AS owner_oid, owner.rolname AS owner, n.nspacl
  FROM pg_catalog.pg_namespace n
  JOIN pg_catalog.pg_roles owner ON owner.oid = n.nspowner
  WHERE n.nspname <> 'information_schema'
    AND n.nspname <> 'q12_guard'
    AND n.nspname !~ '^pg_'
),
schema_less_comment_classes AS (
  SELECT classoid
  FROM (VALUES
    ('pg_catalog.pg_am'::regclass),
    ('pg_catalog.pg_cast'::regclass),
    ('pg_catalog.pg_event_trigger'::regclass),
    ('pg_catalog.pg_foreign_data_wrapper'::regclass),
    ('pg_catalog.pg_foreign_server'::regclass),
    ('pg_catalog.pg_language'::regclass),
    ('pg_catalog.pg_publication'::regclass),
    ('pg_catalog.pg_subscription'::regclass),
    ('pg_catalog.pg_transform'::regclass)
  ) classes(classoid)
),
schema_less_security_label_classes AS (
  SELECT classoid
  FROM (VALUES
    ('pg_catalog.pg_event_trigger'::regclass),
    ('pg_catalog.pg_language'::regclass),
    ('pg_catalog.pg_publication'::regclass),
    ('pg_catalog.pg_subscription'::regclass)
  ) classes(classoid)
),
database_row AS (
  SELECT jsonb_build_object(
    'owner', owner.rolname,
    'encoding', pg_catalog.pg_encoding_to_char(database_object.encoding),
    'locale_provider', database_object.datlocprovider::text,
    'collation', database_object.datcollate,
    'ctype', database_object.datctype,
    'icu_locale', to_jsonb(database_object)->>'daticulocale',
    'icu_rules', to_jsonb(database_object)->>'daticurules',
    'builtin_locale', to_jsonb(database_object)->>'datbuiltinlocale',
    'locale', to_jsonb(database_object)->>'datlocale',
    'collation_version', database_object.datcollversion,
    'tablespace', tablespace.spcname,
    'connection_limit', database_object.datconnlimit,
    'allow_connections', database_object.datallowconn,
    'is_template', database_object.datistemplate,
    'acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(COALESCE(
        database_object.datacl,
        pg_catalog.acldefault('d', database_object.datdba)
      )) item
    ), '[]'::jsonb),
    'settings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'role', normalized.role_name,
        'settings', normalized.settings
      ) ORDER BY normalized.role_name)
      FROM (
        SELECT COALESCE(role.rolname, '') AS role_name,
          jsonb_agg(setting ORDER BY setting) AS settings
        FROM pg_catalog.pg_db_role_setting configured
        LEFT JOIN pg_catalog.pg_roles role ON role.oid = configured.setrole
        CROSS JOIN LATERAL pg_catalog.unnest(configured.setconfig) setting
        WHERE configured.setdatabase = database_object.oid
          AND pg_catalog.split_part(setting, '=', 1) <> ALL (
            ARRAY['default_transaction_read_only','cron.database_name','cron.launch_active_jobs']
          )
        GROUP BY COALESCE(role.rolname, '')
      ) normalized
    ), '[]'::jsonb),
    'comment', pg_catalog.shobj_description(database_object.oid, 'pg_database'),
    'security_labels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'provider', security_label.provider,
        'label', security_label.label
      ) ORDER BY security_label.provider)
      FROM pg_catalog.pg_shseclabel security_label
      WHERE security_label.classoid = 'pg_catalog.pg_database'::regclass
        AND security_label.objoid = database_object.oid
    ), '[]'::jsonb)
  ) AS value
  FROM pg_catalog.pg_database database_object
  JOIN pg_catalog.pg_roles owner ON owner.oid = database_object.datdba
  JOIN pg_catalog.pg_tablespace tablespace ON tablespace.oid = database_object.dattablespace
  WHERE database_object.datname = pg_catalog.current_database()
),
schema_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', namespace.nspname,
    'owner', namespace.owner,
    'acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(COALESCE(namespace.nspacl, pg_catalog.acldefault('n', namespace.owner_oid))) item
    ), '[]'::jsonb)
  ) ORDER BY namespace.nspname), '[]'::jsonb) AS value
  FROM structural_namespaces namespace
),
relation_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', relation.relname,
    'relkind', relation.relkind::text,
    'parents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'schema', parent_namespace.nspname,
        'name', parent.relname
      ) ORDER BY parent_namespace.nspname, parent.relname)
      FROM pg_catalog.pg_inherits inheritance
      JOIN pg_catalog.pg_class parent ON parent.oid = inheritance.inhparent
      JOIN pg_catalog.pg_namespace parent_namespace ON parent_namespace.oid = parent.relnamespace
      WHERE inheritance.inhrelid = relation.oid
    ), '[]'::jsonb),
    'owner', owner.rolname,
    'persistence', relation.relpersistence::text,
    'replica_identity', relation.relreplident::text,
    'row_security', relation.relrowsecurity,
    'force_row_security', relation.relforcerowsecurity,
    'partition_bound', pg_catalog.pg_get_expr(relation.relpartbound, relation.oid, true),
    'partition_key', CASE WHEN relation.relkind = 'p' THEN pg_catalog.pg_get_partkeydef(relation.oid) ELSE NULL END,
    'view_definition', CASE WHEN relation.relkind IN ('v', 'm')
      THEN pg_catalog.pg_get_viewdef(relation.oid, true) ELSE NULL END,
    'options', COALESCE((
      SELECT jsonb_agg(option ORDER BY option)
      FROM pg_catalog.unnest(COALESCE(relation.reloptions, ARRAY[]::text[])) option
    ), '[]'::jsonb),
    'tablespace', tablespace.spcname,
    'access_method', access_method.amname,
    'populated', relation.relispopulated,
    'acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(COALESCE(
        relation.relacl,
        pg_catalog.acldefault((CASE WHEN relation.relkind = 'S' THEN 's' ELSE 'r' END)::"char", relation.relowner)
      )) item
    ), '[]'::jsonb)
  ) ORDER BY namespace.nspname, relation.relname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_class relation
  JOIN structural_namespaces namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = relation.relowner
  LEFT JOIN pg_catalog.pg_tablespace tablespace ON tablespace.oid = relation.reltablespace
  LEFT JOIN pg_catalog.pg_am access_method ON access_method.oid = relation.relam
  WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S', 'c')
),
column_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'relation', relation.relname,
    'position', attribute.attnum,
    'name', attribute.attname,
    'type', pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
    'not_null', attribute.attnotnull,
    'identity', attribute.attidentity::text,
    'generated', attribute.attgenerated::text,
    'storage', attribute.attstorage::text,
    'compression', attribute.attcompression::text,
    'statistics_target', attribute.attstattarget,
    'local', attribute.attislocal,
    'inheritance_count', attribute.attinhcount,
    'has_missing', attribute.atthasmissing,
    'missing_value', to_jsonb(attribute.attmissingval),
    'options', COALESCE((
      SELECT jsonb_agg(option ORDER BY option)
      FROM pg_catalog.unnest(COALESCE(attribute.attoptions, ARRAY[]::text[])) option
    ), '[]'::jsonb),
    'fdw_options', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', pg_catalog.split_part(option, '=', 1),
        'value_sha256', encode(extensions.digest(convert_to(
          pg_catalog.substr(option, pg_catalog.strpos(option, '=') + 1), 'UTF8'
        ), 'sha256'), 'hex')
      ) ORDER BY pg_catalog.split_part(option, '=', 1))
      FROM pg_catalog.unnest(COALESCE(attribute.attfdwoptions, ARRAY[]::text[])) option
    ), '[]'::jsonb),
    'collation_schema', collation_namespace.nspname,
    'collation_name', collation_object.collname,
    'default', pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid, true),
    'acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(COALESCE(attribute.attacl, ARRAY[]::aclitem[])) item
    ), '[]'::jsonb)
  ) ORDER BY namespace.nspname, relation.relname, attribute.attnum), '[]'::jsonb) AS value
  FROM pg_catalog.pg_attribute attribute
  JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
  JOIN structural_namespaces namespace ON namespace.oid = relation.relnamespace
  LEFT JOIN pg_catalog.pg_attrdef default_value
    ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
  LEFT JOIN pg_catalog.pg_collation collation_object ON collation_object.oid = attribute.attcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid = collation_object.collnamespace
  WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
    AND relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'c')
),
sequence_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', relation.relname,
    'owner', owner.rolname,
    'data_type', pg_catalog.format_type(sequence.seqtypid, NULL),
    'start', sequence.seqstart,
    'increment', sequence.seqincrement,
    'minimum', sequence.seqmin,
    'maximum', sequence.seqmax,
    'cache', sequence.seqcache,
    'cycle', sequence.seqcycle,
    'acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(COALESCE(relation.relacl, pg_catalog.acldefault('s', relation.relowner))) item
    ), '[]'::jsonb)
  ) ORDER BY namespace.nspname, relation.relname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_sequence sequence
  JOIN pg_catalog.pg_class relation ON relation.oid = sequence.seqrelid
  JOIN structural_namespaces namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = relation.relowner
),
extension_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', extension.extname,
    'version', extension.extversion,
    'schema', namespace.nspname,
    'owner', owner.rolname,
    'relocatable', extension.extrelocatable,
    'comment', pg_catalog.obj_description(extension.oid, 'pg_extension'),
    'security_labels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'provider', security_label.provider,
        'label', security_label.label
      ) ORDER BY security_label.provider)
      FROM pg_catalog.pg_seclabel security_label
      WHERE security_label.classoid = 'pg_catalog.pg_extension'::regclass
        AND security_label.objoid = extension.oid
        AND security_label.objsubid = 0
    ), '[]'::jsonb)
  ) ORDER BY extension.extname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_extension extension
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = extension.extnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = extension.extowner
),
type_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', type_object.typname,
    'owner', owner.rolname,
    'kind', type_object.typtype::text,
    'category', type_object.typcategory::text,
    'preferred', type_object.typispreferred,
    'defined', type_object.typisdefined,
    'delimiter', type_object.typdelim::text,
    'collation_schema', collation_namespace.nspname,
    'collation_name', collation_object.collname,
    'domain_base_type', CASE WHEN type_object.typtype = 'd'
      THEN pg_catalog.format_type(type_object.typbasetype, type_object.typtypmod) ELSE NULL END,
    'domain_not_null', type_object.typnotnull,
    'domain_default', type_object.typdefault,
    'enum_labels', COALESCE((
      SELECT jsonb_agg(enum.enumlabel ORDER BY enum.enumsortorder)
      FROM pg_catalog.pg_enum enum WHERE enum.enumtypid = type_object.oid
    ), '[]'::jsonb),
    'range_subtype', pg_catalog.format_type(range.rngsubtype, NULL),
    'range_collation_schema', range_collation_namespace.nspname,
    'range_collation_name', range_collation.collname,
    'acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(COALESCE(type_object.typacl, pg_catalog.acldefault('T', type_object.typowner))) item
    ), '[]'::jsonb)
  ) ORDER BY namespace.nspname, type_object.typname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_type type_object
  JOIN structural_namespaces namespace ON namespace.oid = type_object.typnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = type_object.typowner
  LEFT JOIN pg_catalog.pg_collation collation_object ON collation_object.oid = type_object.typcollation
  LEFT JOIN pg_catalog.pg_namespace collation_namespace ON collation_namespace.oid = collation_object.collnamespace
  LEFT JOIN pg_catalog.pg_range range ON range.rngtypid = type_object.oid
  LEFT JOIN pg_catalog.pg_collation range_collation ON range_collation.oid = range.rngcollation
  LEFT JOIN pg_catalog.pg_namespace range_collation_namespace
    ON range_collation_namespace.oid = range_collation.collnamespace
),
access_method_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', access_method.amname,
    'type', access_method.amtype::text,
    'handler_schema', handler_namespace.nspname,
    'handler_name', handler.proname,
    'handler_identity_arguments', pg_catalog.pg_get_function_identity_arguments(handler.oid)
  ) ORDER BY access_method.amname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_am access_method
  JOIN pg_catalog.pg_proc handler ON handler.oid = access_method.amhandler
  JOIN pg_catalog.pg_namespace handler_namespace ON handler_namespace.oid = handler.pronamespace
),
cast_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'source_type', pg_catalog.format_type(cast_object.castsource, NULL),
    'target_type', pg_catalog.format_type(cast_object.casttarget, NULL),
    'context', cast_object.castcontext::text,
    'method', cast_object.castmethod::text,
    'function_schema', function_namespace.nspname,
    'function_name', function_object.proname,
    'function_identity_arguments', CASE WHEN function_object.oid IS NULL THEN NULL
      ELSE pg_catalog.pg_get_function_identity_arguments(function_object.oid) END
  ) ORDER BY pg_catalog.format_type(cast_object.castsource, NULL),
    pg_catalog.format_type(cast_object.casttarget, NULL)), '[]'::jsonb) AS value
  FROM pg_catalog.pg_cast cast_object
  LEFT JOIN pg_catalog.pg_proc function_object ON function_object.oid = cast_object.castfunc
  LEFT JOIN pg_catalog.pg_namespace function_namespace
    ON function_namespace.oid = function_object.pronamespace
),
collation_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', collation_object.collname,
    'owner', owner.rolname,
    'provider', collation_object.collprovider::text,
    'deterministic', collation_object.collisdeterministic,
    'encoding', collation_object.collencoding,
    'collate', collation_object.collcollate,
    'ctype', collation_object.collctype,
    'locale', collation_object.colllocale,
    'icu_rules', collation_object.collicurules,
    'version', collation_object.collversion
  ) ORDER BY namespace.nspname, collation_object.collname, collation_object.collencoding),
    '[]'::jsonb) AS value
  FROM pg_catalog.pg_collation collation_object
  JOIN structural_namespaces namespace ON namespace.oid = collation_object.collnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = collation_object.collowner
),
conversion_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', conversion.conname,
    'owner', owner.rolname,
    'source_encoding', pg_catalog.pg_encoding_to_char(conversion.conforencoding),
    'target_encoding', pg_catalog.pg_encoding_to_char(conversion.contoencoding),
    'default', conversion.condefault,
    'function_schema', function_namespace.nspname,
    'function_name', function_object.proname,
    'function_identity_arguments', pg_catalog.pg_get_function_identity_arguments(function_object.oid)
  ) ORDER BY namespace.nspname, conversion.conname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_conversion conversion
  JOIN structural_namespaces namespace ON namespace.oid = conversion.connamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = conversion.conowner
  JOIN pg_catalog.pg_proc function_object ON function_object.oid = conversion.conproc
  JOIN pg_catalog.pg_namespace function_namespace
    ON function_namespace.oid = function_object.pronamespace
),
foreign_data_wrapper_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', wrapper.fdwname,
    'owner', owner.rolname,
    'handler_schema', handler_namespace.nspname,
    'handler_name', handler.proname,
    'handler_identity_arguments', CASE WHEN handler.oid IS NULL THEN NULL
      ELSE pg_catalog.pg_get_function_identity_arguments(handler.oid) END,
    'validator_schema', validator_namespace.nspname,
    'validator_name', validator.proname,
    'validator_identity_arguments', CASE WHEN validator.oid IS NULL THEN NULL
      ELSE pg_catalog.pg_get_function_identity_arguments(validator.oid) END,
    'options', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', pg_catalog.split_part(option, '=', 1),
        'value_sha256', encode(extensions.digest(convert_to(
          pg_catalog.substr(option, pg_catalog.strpos(option, '=') + 1), 'UTF8'
        ), 'sha256'), 'hex')
      ) ORDER BY pg_catalog.split_part(option, '=', 1))
      FROM pg_catalog.unnest(COALESCE(wrapper.fdwoptions, ARRAY[]::text[])) option
    ), '[]'::jsonb),
    'acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(COALESCE(wrapper.fdwacl,
        pg_catalog.acldefault('F', wrapper.fdwowner))) item
    ), '[]'::jsonb)
  ) ORDER BY wrapper.fdwname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_foreign_data_wrapper wrapper
  JOIN pg_catalog.pg_roles owner ON owner.oid = wrapper.fdwowner
  LEFT JOIN pg_catalog.pg_proc handler ON handler.oid = wrapper.fdwhandler
  LEFT JOIN pg_catalog.pg_namespace handler_namespace ON handler_namespace.oid = handler.pronamespace
  LEFT JOIN pg_catalog.pg_proc validator ON validator.oid = wrapper.fdwvalidator
  LEFT JOIN pg_catalog.pg_namespace validator_namespace
    ON validator_namespace.oid = validator.pronamespace
),
foreign_server_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', server.srvname,
    'owner', owner.rolname,
    'foreign_data_wrapper', wrapper.fdwname,
    'type', server.srvtype,
    'version', server.srvversion,
    'options', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', pg_catalog.split_part(option, '=', 1),
        'value_sha256', encode(extensions.digest(convert_to(
          pg_catalog.substr(option, pg_catalog.strpos(option, '=') + 1), 'UTF8'
        ), 'sha256'), 'hex')
      ) ORDER BY pg_catalog.split_part(option, '=', 1))
      FROM pg_catalog.unnest(COALESCE(server.srvoptions, ARRAY[]::text[])) option
    ), '[]'::jsonb),
    'acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(COALESCE(server.srvacl,
        pg_catalog.acldefault('S', server.srvowner))) item
    ), '[]'::jsonb)
  ) ORDER BY server.srvname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_foreign_server server
  JOIN pg_catalog.pg_foreign_data_wrapper wrapper ON wrapper.oid = server.srvfdw
  JOIN pg_catalog.pg_roles owner ON owner.oid = server.srvowner
),
user_mapping_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'server', server.srvname,
    'user', CASE WHEN user_mapping.umuser = 0 THEN 'PUBLIC' ELSE role.rolname END,
    'options', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', pg_catalog.split_part(option, '=', 1),
        'value_sha256', encode(extensions.digest(convert_to(
          pg_catalog.substr(option, pg_catalog.strpos(option, '=') + 1), 'UTF8'
        ), 'sha256'), 'hex')
      ) ORDER BY pg_catalog.split_part(option, '=', 1))
      FROM pg_catalog.unnest(COALESCE(user_mapping.umoptions, ARRAY[]::text[])) option
    ), '[]'::jsonb)
  ) ORDER BY server.srvname,
    CASE WHEN user_mapping.umuser = 0 THEN 'PUBLIC' ELSE role.rolname END), '[]'::jsonb) AS value
  FROM pg_catalog.pg_user_mapping user_mapping
  JOIN pg_catalog.pg_foreign_server server ON server.oid = user_mapping.umserver
  LEFT JOIN pg_catalog.pg_roles role ON role.oid = user_mapping.umuser
),
language_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', language.lanname,
    'owner', owner.rolname,
    'procedural', language.lanispl,
    'trusted', language.lanpltrusted,
    'call_handler', call_handler.proname,
    'call_handler_schema', call_handler_namespace.nspname,
    'inline_handler', inline_handler.proname,
    'inline_handler_schema', inline_handler_namespace.nspname,
    'validator', validator.proname,
    'validator_schema', validator_namespace.nspname,
    'acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(COALESCE(language.lanacl,
        pg_catalog.acldefault('l', language.lanowner))) item
    ), '[]'::jsonb)
  ) ORDER BY language.lanname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_language language
  JOIN pg_catalog.pg_roles owner ON owner.oid = language.lanowner
  LEFT JOIN pg_catalog.pg_proc call_handler ON call_handler.oid = language.lanplcallfoid
  LEFT JOIN pg_catalog.pg_namespace call_handler_namespace
    ON call_handler_namespace.oid = call_handler.pronamespace
  LEFT JOIN pg_catalog.pg_proc inline_handler ON inline_handler.oid = language.laninline
  LEFT JOIN pg_catalog.pg_namespace inline_handler_namespace
    ON inline_handler_namespace.oid = inline_handler.pronamespace
  LEFT JOIN pg_catalog.pg_proc validator ON validator.oid = language.lanvalidator
  LEFT JOIN pg_catalog.pg_namespace validator_namespace
    ON validator_namespace.oid = validator.pronamespace
),
operator_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', operator_object.oprname,
    'owner', owner.rolname,
    'kind', operator_object.oprkind::text,
    'can_merge', operator_object.oprcanmerge,
    'can_hash', operator_object.oprcanhash,
    'left_type', operator_identity.left_type,
    'right_type', operator_identity.right_type,
    'result_type', pg_catalog.format_type(operator_object.oprresult, NULL),
    'function_schema', function_namespace.nspname,
    'function_name', function_object.proname,
    'function_identity_arguments', pg_catalog.pg_get_function_identity_arguments(function_object.oid),
    'restriction_schema', restriction_namespace.nspname,
    'restriction_name', restriction_function.proname,
    'join_schema', join_namespace.nspname,
    'join_name', join_function.proname,
    'commutator', CASE WHEN commutator.oid IS NULL THEN NULL ELSE
      pg_catalog.format('%I.%I(%s,%s)', commutator_namespace.nspname, commutator.oprname,
        pg_catalog.format_type(commutator.oprleft, NULL),
        pg_catalog.format_type(commutator.oprright, NULL)) END,
    'negator', CASE WHEN negator.oid IS NULL THEN NULL ELSE
      pg_catalog.format('%I.%I(%s,%s)', negator_namespace.nspname, negator.oprname,
        pg_catalog.format_type(negator.oprleft, NULL),
        pg_catalog.format_type(negator.oprright, NULL)) END
  ) ORDER BY namespace.nspname, operator_object.oprname,
    COALESCE(operator_identity.left_type, ''),
    COALESCE(operator_identity.right_type, '')), '[]'::jsonb) AS value
  FROM pg_catalog.pg_operator operator_object
  JOIN structural_namespaces namespace ON namespace.oid = operator_object.oprnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = operator_object.oprowner
  JOIN pg_catalog.pg_proc function_object ON function_object.oid = operator_object.oprcode
  JOIN pg_catalog.pg_namespace function_namespace
    ON function_namespace.oid = function_object.pronamespace
  LEFT JOIN pg_catalog.pg_proc restriction_function ON restriction_function.oid = operator_object.oprrest
  LEFT JOIN pg_catalog.pg_namespace restriction_namespace
    ON restriction_namespace.oid = restriction_function.pronamespace
  LEFT JOIN pg_catalog.pg_proc join_function ON join_function.oid = operator_object.oprjoin
  LEFT JOIN pg_catalog.pg_namespace join_namespace ON join_namespace.oid = join_function.pronamespace
  LEFT JOIN pg_catalog.pg_operator commutator ON commutator.oid = operator_object.oprcom
  LEFT JOIN pg_catalog.pg_namespace commutator_namespace
    ON commutator_namespace.oid = commutator.oprnamespace
  LEFT JOIN pg_catalog.pg_operator negator ON negator.oid = operator_object.oprnegate
  LEFT JOIN pg_catalog.pg_namespace negator_namespace ON negator_namespace.oid = negator.oprnamespace
  CROSS JOIN LATERAL (
    SELECT CASE WHEN operator_object.oprleft = 0 THEN NULL
        ELSE pg_catalog.format_type(operator_object.oprleft, NULL) END AS left_type,
      CASE WHEN operator_object.oprright = 0 THEN NULL
        ELSE pg_catalog.format_type(operator_object.oprright, NULL) END AS right_type
  ) operator_identity
),
operator_family_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', operator_family.opfname,
    'owner', owner.rolname,
    'access_method', access_method.amname,
    'operators', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'strategy', family_operator.amopstrategy,
        'purpose', family_operator.amoppurpose::text,
        'left_type', member_identity.left_type,
        'right_type', member_identity.right_type,
        'operator_schema', member_namespace.nspname,
        'operator_name', member_operator.oprname,
        'sort_family_schema', sort_family_namespace.nspname,
        'sort_family_name', sort_family.opfname
      ) ORDER BY member_identity.left_type, member_identity.right_type,
        family_operator.amopstrategy, family_operator.amoppurpose,
        member_namespace.nspname, member_operator.oprname,
        COALESCE(sort_family_namespace.nspname, ''), COALESCE(sort_family.opfname, ''))
      FROM pg_catalog.pg_amop family_operator
      JOIN pg_catalog.pg_operator member_operator ON member_operator.oid = family_operator.amopopr
      JOIN pg_catalog.pg_namespace member_namespace
        ON member_namespace.oid = member_operator.oprnamespace
      LEFT JOIN pg_catalog.pg_opfamily sort_family
        ON sort_family.oid = family_operator.amopsortfamily
      LEFT JOIN pg_catalog.pg_namespace sort_family_namespace
        ON sort_family_namespace.oid = sort_family.opfnamespace
      CROSS JOIN LATERAL (
        SELECT pg_catalog.format_type(family_operator.amoplefttype, NULL) AS left_type,
          pg_catalog.format_type(family_operator.amoprighttype, NULL) AS right_type
      ) member_identity
      WHERE family_operator.amopfamily = operator_family.oid
    ), '[]'::jsonb),
    'functions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'number', family_function.amprocnum,
        'left_type', member_identity.left_type,
        'right_type', member_identity.right_type,
        'function_schema', member_namespace.nspname,
        'function_name', member_function.proname,
        'function_identity_arguments', pg_catalog.pg_get_function_identity_arguments(member_function.oid)
      ) ORDER BY member_identity.left_type, member_identity.right_type,
        family_function.amprocnum, member_namespace.nspname, member_function.proname,
        pg_catalog.pg_get_function_identity_arguments(member_function.oid))
      FROM pg_catalog.pg_amproc family_function
      JOIN pg_catalog.pg_proc member_function ON member_function.oid = family_function.amproc
      JOIN pg_catalog.pg_namespace member_namespace
        ON member_namespace.oid = member_function.pronamespace
      CROSS JOIN LATERAL (
        SELECT pg_catalog.format_type(family_function.amproclefttype, NULL) AS left_type,
          pg_catalog.format_type(family_function.amprocrighttype, NULL) AS right_type
      ) member_identity
      WHERE family_function.amprocfamily = operator_family.oid
    ), '[]'::jsonb)
  ) ORDER BY namespace.nspname, operator_family.opfname, access_method.amname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_opfamily operator_family
  JOIN structural_namespaces namespace ON namespace.oid = operator_family.opfnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = operator_family.opfowner
  JOIN pg_catalog.pg_am access_method ON access_method.oid = operator_family.opfmethod
),
operator_class_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', operator_class.opcname,
    'owner', owner.rolname,
    'access_method', access_method.amname,
    'family_schema', family_namespace.nspname,
    'family_name', operator_family.opfname,
    'input_type', pg_catalog.format_type(operator_class.opcintype, NULL),
    'default', operator_class.opcdefault,
    'key_type', CASE WHEN operator_class.opckeytype = 0 THEN NULL
      ELSE pg_catalog.format_type(operator_class.opckeytype, NULL) END
  ) ORDER BY namespace.nspname, operator_class.opcname, access_method.amname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_opclass operator_class
  JOIN structural_namespaces namespace ON namespace.oid = operator_class.opcnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = operator_class.opcowner
  JOIN pg_catalog.pg_am access_method ON access_method.oid = operator_class.opcmethod
  JOIN pg_catalog.pg_opfamily operator_family ON operator_family.oid = operator_class.opcfamily
  JOIN pg_catalog.pg_namespace family_namespace ON family_namespace.oid = operator_family.opfnamespace
),
extended_statistics_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', statistics.stxname,
    'owner', owner.rolname,
    'relation_schema', relation_namespace.nspname,
    'relation_name', relation.relname,
    'definition', pg_catalog.pg_get_statisticsobjdef(statistics.oid),
    'target', statistics.stxstattarget,
    'kinds', COALESCE((
      SELECT jsonb_agg(kind::text ORDER BY kind::text)
      FROM pg_catalog.unnest(statistics.stxkind) kind
    ), '[]'::jsonb)
  ) ORDER BY namespace.nspname, statistics.stxname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_statistic_ext statistics
  JOIN structural_namespaces namespace ON namespace.oid = statistics.stxnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = statistics.stxowner
  JOIN pg_catalog.pg_class relation ON relation.oid = statistics.stxrelid
  JOIN pg_catalog.pg_namespace relation_namespace ON relation_namespace.oid = relation.relnamespace
),
text_search_parser_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', parser.prsname,
    'start', start_function.proname,
    'token', token_function.proname,
    'end', end_function.proname,
    'headline', headline_function.proname,
    'lex_types', lex_types_function.proname
  ) ORDER BY namespace.nspname, parser.prsname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_ts_parser parser
  JOIN structural_namespaces namespace ON namespace.oid = parser.prsnamespace
  JOIN pg_catalog.pg_proc start_function ON start_function.oid = parser.prsstart
  JOIN pg_catalog.pg_proc token_function ON token_function.oid = parser.prstoken
  JOIN pg_catalog.pg_proc end_function ON end_function.oid = parser.prsend
  LEFT JOIN pg_catalog.pg_proc headline_function ON headline_function.oid = parser.prsheadline
  JOIN pg_catalog.pg_proc lex_types_function ON lex_types_function.oid = parser.prslextype
),
text_search_template_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', template.tmplname,
    'init_schema', init_namespace.nspname,
    'init_name', init_function.proname,
    'lexize_schema', lexize_namespace.nspname,
    'lexize_name', lexize_function.proname
  ) ORDER BY namespace.nspname, template.tmplname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_ts_template template
  JOIN structural_namespaces namespace ON namespace.oid = template.tmplnamespace
  LEFT JOIN pg_catalog.pg_proc init_function ON init_function.oid = template.tmplinit
  LEFT JOIN pg_catalog.pg_namespace init_namespace ON init_namespace.oid = init_function.pronamespace
  JOIN pg_catalog.pg_proc lexize_function ON lexize_function.oid = template.tmpllexize
  JOIN pg_catalog.pg_namespace lexize_namespace ON lexize_namespace.oid = lexize_function.pronamespace
),
text_search_dictionary_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', dictionary.dictname,
    'owner', owner.rolname,
    'template_schema', template_namespace.nspname,
    'template_name', template.tmplname,
    'init_options', dictionary.dictinitoption
  ) ORDER BY namespace.nspname, dictionary.dictname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_ts_dict dictionary
  JOIN structural_namespaces namespace ON namespace.oid = dictionary.dictnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = dictionary.dictowner
  JOIN pg_catalog.pg_ts_template template ON template.oid = dictionary.dicttemplate
  JOIN pg_catalog.pg_namespace template_namespace ON template_namespace.oid = template.tmplnamespace
),
text_search_configuration_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', configuration.cfgname,
    'owner', owner.rolname,
    'parser_schema', parser_namespace.nspname,
    'parser_name', parser.prsname,
    'mappings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'token_type', mapping_group.maptokentype,
        'dictionaries', mapping_group.dictionaries
      ) ORDER BY mapping_group.maptokentype)
      FROM (
        SELECT configuration_mapping.maptokentype,
          jsonb_agg(jsonb_build_object(
            'schema', dictionary_namespace.nspname,
            'name', dictionary.dictname
          ) ORDER BY configuration_mapping.mapseqno) AS dictionaries
        FROM pg_catalog.pg_ts_config_map configuration_mapping
        JOIN pg_catalog.pg_ts_dict dictionary ON dictionary.oid = configuration_mapping.mapdict
        JOIN pg_catalog.pg_namespace dictionary_namespace
          ON dictionary_namespace.oid = dictionary.dictnamespace
        WHERE configuration_mapping.mapcfg = configuration.oid
        GROUP BY configuration_mapping.maptokentype
      ) mapping_group
    ), '[]'::jsonb)
  ) ORDER BY namespace.nspname, configuration.cfgname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_ts_config configuration
  JOIN structural_namespaces namespace ON namespace.oid = configuration.cfgnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = configuration.cfgowner
  JOIN pg_catalog.pg_ts_parser parser ON parser.oid = configuration.cfgparser
  JOIN pg_catalog.pg_namespace parser_namespace ON parser_namespace.oid = parser.prsnamespace
),
transform_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', pg_catalog.format_type(transform.trftype, NULL),
    'language', language.lanname,
    'from_sql_schema', from_sql_namespace.nspname,
    'from_sql_name', from_sql.proname,
    'from_sql_identity_arguments', CASE WHEN from_sql.oid IS NULL THEN NULL
      ELSE pg_catalog.pg_get_function_identity_arguments(from_sql.oid) END,
    'to_sql_schema', to_sql_namespace.nspname,
    'to_sql_name', to_sql.proname,
    'to_sql_identity_arguments', CASE WHEN to_sql.oid IS NULL THEN NULL
      ELSE pg_catalog.pg_get_function_identity_arguments(to_sql.oid) END
  ) ORDER BY pg_catalog.format_type(transform.trftype, NULL), language.lanname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_transform transform
  JOIN pg_catalog.pg_language language ON language.oid = transform.trflang
  LEFT JOIN pg_catalog.pg_proc from_sql ON from_sql.oid = transform.trffromsql
  LEFT JOIN pg_catalog.pg_namespace from_sql_namespace
    ON from_sql_namespace.oid = from_sql.pronamespace
  LEFT JOIN pg_catalog.pg_proc to_sql ON to_sql.oid = transform.trftosql
  LEFT JOIN pg_catalog.pg_namespace to_sql_namespace ON to_sql_namespace.oid = to_sql.pronamespace
),
publication_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', publication.pubname,
    'owner', owner.rolname,
    'all_tables', publication.puballtables,
    'insert', publication.pubinsert,
    'update', publication.pubupdate,
    'delete', publication.pubdelete,
    'truncate', publication.pubtruncate,
    'via_partition_root', publication.pubviaroot,
    'schemas', COALESCE((
      SELECT jsonb_agg(namespace.nspname ORDER BY namespace.nspname)
      FROM pg_catalog.pg_publication_namespace publication_namespace
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = publication_namespace.pnnspid
      WHERE publication_namespace.pnpubid = publication.oid
    ), '[]'::jsonb),
    'relations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'schema', namespace.nspname,
        'name', relation.relname,
        'row_filter', pg_catalog.pg_get_expr(publication_relation.prqual,
          publication_relation.prrelid, true),
        'columns', COALESCE((
          SELECT jsonb_agg(attribute.attname ORDER BY attribute.attnum)
          FROM pg_catalog.unnest(publication_relation.prattrs::smallint[]) attribute_number(attnum)
          JOIN pg_catalog.pg_attribute attribute
            ON attribute.attrelid = publication_relation.prrelid
           AND attribute.attnum = attribute_number.attnum
        ), '[]'::jsonb)
      ) ORDER BY namespace.nspname, relation.relname)
      FROM pg_catalog.pg_publication_rel publication_relation
      JOIN pg_catalog.pg_class relation ON relation.oid = publication_relation.prrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE publication_relation.prpubid = publication.oid
    ), '[]'::jsonb)
  ) ORDER BY publication.pubname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_publication publication
  JOIN pg_catalog.pg_roles owner ON owner.oid = publication.pubowner
),
subscription_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', subscription.subname,
    'owner', owner.rolname,
    'enabled', subscription.subenabled,
    'binary', subscription.subbinary,
    'streaming', subscription.substream::text,
    'two_phase_state', subscription.subtwophasestate::text,
    'disable_on_error', subscription.subdisableonerr,
    'password_required', subscription.subpasswordrequired,
    'run_as_owner', subscription.subrunasowner,
    'failover', subscription.subfailover,
    'connection_sha256', encode(extensions.digest(convert_to(subscription.subconninfo, 'UTF8'),
      'sha256'), 'hex'),
    'slot_name', subscription.subslotname,
    'synchronous_commit', subscription.subsynccommit,
    'publications', COALESCE((
      SELECT jsonb_agg(publication_name ORDER BY publication_name)
      FROM pg_catalog.unnest(subscription.subpublications) publication_name
    ), '[]'::jsonb),
    'origin', subscription.suborigin
  ) ORDER BY subscription.subname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_subscription subscription
  JOIN pg_catalog.pg_roles owner ON owner.oid = subscription.subowner
  WHERE subscription.subdbid = (SELECT oid FROM pg_catalog.pg_database
    WHERE datname = pg_catalog.current_database())
),
foreign_table_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', relation.relname,
    'server', server.srvname,
    'server_owner', server_owner.rolname,
    'server_type', server.srvtype,
    'server_version', server.srvversion,
    'server_comment', pg_catalog.obj_description(server.oid, 'pg_foreign_server'),
    'server_security_labels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'provider', security_label.provider,
        'label', security_label.label
      ) ORDER BY security_label.provider)
      FROM pg_catalog.pg_seclabel security_label
      WHERE security_label.classoid = 'pg_catalog.pg_foreign_server'::regclass
        AND security_label.objoid = server.oid
        AND security_label.objsubid = 0
    ), '[]'::jsonb),
    'fdw', wrapper.fdwname,
    'fdw_owner', wrapper_owner.rolname,
    'fdw_comment', pg_catalog.obj_description(wrapper.oid, 'pg_foreign_data_wrapper'),
    'fdw_security_labels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'provider', security_label.provider,
        'label', security_label.label
      ) ORDER BY security_label.provider)
      FROM pg_catalog.pg_seclabel security_label
      WHERE security_label.classoid = 'pg_catalog.pg_foreign_data_wrapper'::regclass
        AND security_label.objoid = wrapper.oid
        AND security_label.objsubid = 0
    ), '[]'::jsonb),
    'server_options', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', pg_catalog.split_part(option, '=', 1),
        'value_sha256', encode(extensions.digest(convert_to(
          pg_catalog.substr(option, pg_catalog.strpos(option, '=') + 1), 'UTF8'
        ), 'sha256'), 'hex')
      ) ORDER BY pg_catalog.split_part(option, '=', 1))
      FROM pg_catalog.unnest(COALESCE(server.srvoptions, ARRAY[]::text[])) option
    ), '[]'::jsonb),
    'server_acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(COALESCE(server.srvacl, pg_catalog.acldefault('S', server.srvowner))) item
    ), '[]'::jsonb),
    'fdw_options', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', pg_catalog.split_part(option, '=', 1),
        'value_sha256', encode(extensions.digest(convert_to(
          pg_catalog.substr(option, pg_catalog.strpos(option, '=') + 1), 'UTF8'
        ), 'sha256'), 'hex')
      ) ORDER BY pg_catalog.split_part(option, '=', 1))
      FROM pg_catalog.unnest(COALESCE(wrapper.fdwoptions, ARRAY[]::text[])) option
    ), '[]'::jsonb),
    'fdw_acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(COALESCE(wrapper.fdwacl, pg_catalog.acldefault('F', wrapper.fdwowner))) item
    ), '[]'::jsonb),
    'table_options', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', pg_catalog.split_part(option, '=', 1),
        'value_sha256', encode(extensions.digest(convert_to(
          pg_catalog.substr(option, pg_catalog.strpos(option, '=') + 1), 'UTF8'
        ), 'sha256'), 'hex')
      ) ORDER BY pg_catalog.split_part(option, '=', 1))
      FROM pg_catalog.unnest(COALESCE(foreign_table.ftoptions, ARRAY[]::text[])) option
    ), '[]'::jsonb)
  ) ORDER BY namespace.nspname, relation.relname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_foreign_table foreign_table
  JOIN pg_catalog.pg_class relation ON relation.oid = foreign_table.ftrelid
  JOIN structural_namespaces namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_foreign_server server ON server.oid = foreign_table.ftserver
  JOIN pg_catalog.pg_foreign_data_wrapper wrapper ON wrapper.oid = server.srvfdw
  JOIN pg_catalog.pg_roles server_owner ON server_owner.oid = server.srvowner
  JOIN pg_catalog.pg_roles wrapper_owner ON wrapper_owner.oid = wrapper.fdwowner
),
index_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', index_relation.relname,
    'table_schema', table_namespace.nspname,
    'table_name', table_relation.relname,
    'owner', owner.rolname,
    'definition', pg_catalog.pg_get_indexdef(index_relation.oid),
    'valid', index.indisvalid,
    'ready', index.indisready,
    'live', index.indislive,
    'unique', index.indisunique,
    'primary', index.indisprimary,
    'exclusion', index.indisexclusion,
    'replica_identity', index.indisreplident,
    'clustered', index.indisclustered,
    'immediate', index.indimmediate,
    'check_xmin', index.indcheckxmin,
    'nulls_not_distinct', index.indnullsnotdistinct,
    'acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(COALESCE(index_relation.relacl, pg_catalog.acldefault('r', index_relation.relowner))) item
    ), '[]'::jsonb)
  ) ORDER BY namespace.nspname, index_relation.relname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_index index
  JOIN pg_catalog.pg_class index_relation ON index_relation.oid = index.indexrelid
  JOIN structural_namespaces namespace ON namespace.oid = index_relation.relnamespace
  JOIN pg_catalog.pg_class table_relation ON table_relation.oid = index.indrelid
  JOIN pg_catalog.pg_namespace table_namespace ON table_namespace.oid = table_relation.relnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = index_relation.relowner
),
constraint_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', constraint_object.conname,
    'relation_schema', relation_namespace.nspname,
    'relation_name', relation.relname,
    'domain_schema', domain_namespace.nspname,
    'domain_name', domain_type.typname,
    'type', constraint_object.contype::text,
    'definition', pg_catalog.pg_get_constraintdef(constraint_object.oid, true),
    'deferrable', constraint_object.condeferrable,
    'deferred', constraint_object.condeferred,
    'validated', constraint_object.convalidated,
    'no_inherit', constraint_object.connoinherit
  ) ORDER BY namespace.nspname, constraint_object.conname, relation_namespace.nspname, relation.relname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_constraint constraint_object
  JOIN structural_namespaces namespace ON namespace.oid = constraint_object.connamespace
  LEFT JOIN pg_catalog.pg_class relation ON relation.oid = constraint_object.conrelid
  LEFT JOIN pg_catalog.pg_namespace relation_namespace ON relation_namespace.oid = relation.relnamespace
  LEFT JOIN pg_catalog.pg_type domain_type ON domain_type.oid = constraint_object.contypid
  LEFT JOIN pg_catalog.pg_namespace domain_namespace ON domain_namespace.oid = domain_type.typnamespace
),
function_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', procedure.proname,
    'identity_arguments', pg_catalog.pg_get_function_identity_arguments(procedure.oid),
    'owner', owner.rolname,
    'kind', procedure.prokind::text,
    'security_definer', procedure.prosecdef,
    'leakproof', procedure.proleakproof,
    'strict', procedure.proisstrict,
    'volatility', procedure.provolatile::text,
    'parallel', procedure.proparallel::text,
    'returns_set', procedure.proretset,
    'configuration', COALESCE((
      SELECT jsonb_agg(setting ORDER BY setting)
      FROM pg_catalog.unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) setting
    ), '[]'::jsonb),
    'definition', CASE WHEN procedure.prokind IN ('f', 'p', 'w')
      THEN pg_catalog.pg_get_functiondef(procedure.oid)
      ELSE jsonb_build_object(
        'arguments', pg_catalog.pg_get_function_arguments(procedure.oid),
        'result', pg_catalog.pg_get_function_result(procedure.oid),
        'language', language.lanname,
        'source', procedure.prosrc
      )::text END,
    'acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) item
    ), '[]'::jsonb)
  ) ORDER BY namespace.nspname, procedure.proname, pg_catalog.pg_get_function_identity_arguments(procedure.oid)), '[]'::jsonb) AS value
  FROM pg_catalog.pg_proc procedure
  JOIN structural_namespaces namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = procedure.proowner
  JOIN pg_catalog.pg_language language ON language.oid = procedure.prolang
),
trigger_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'relation', relation.relname,
    'name', trigger_object.tgname,
    'definition', pg_catalog.pg_get_triggerdef(trigger_object.oid, true),
    'enabled', trigger_object.tgenabled::text
  ) ORDER BY namespace.nspname, relation.relname, trigger_object.tgname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_trigger trigger_object
  JOIN pg_catalog.pg_class relation ON relation.oid = trigger_object.tgrelid
  JOIN structural_namespaces namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_proc procedure ON procedure.oid = trigger_object.tgfoid
  JOIN pg_catalog.pg_namespace procedure_namespace ON procedure_namespace.oid = procedure.pronamespace
  WHERE NOT trigger_object.tgisinternal
    AND NOT (procedure_namespace.nspname = 'q12_guard' AND procedure.proname = 'enforce_write_barrier')
),
event_trigger_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', event_trigger.evtname,
    'owner', owner.rolname,
    'event', event_trigger.evtevent,
    'enabled', event_trigger.evtenabled::text,
    'tags', COALESCE((
      SELECT jsonb_agg(tag ORDER BY tag)
      FROM pg_catalog.unnest(COALESCE(event_trigger.evttags, ARRAY[]::text[])) tag
    ), '[]'::jsonb),
    'function_schema', function_namespace.nspname,
    'function_name', function_object.proname,
    'function_identity_arguments', pg_catalog.pg_get_function_identity_arguments(function_object.oid)
  ) ORDER BY event_trigger.evtname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_event_trigger event_trigger
  JOIN pg_catalog.pg_roles owner ON owner.oid = event_trigger.evtowner
  JOIN pg_catalog.pg_proc function_object ON function_object.oid = event_trigger.evtfoid
  JOIN pg_catalog.pg_namespace function_namespace ON function_namespace.oid = function_object.pronamespace
  WHERE event_trigger.evtname <> 'q12_guard_ddl_command_start'
),
rule_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'relation', relation.relname,
    'name', rewrite_rule.rulename,
    'event', rewrite_rule.ev_type::text,
    'enabled', rewrite_rule.ev_enabled::text,
    'instead', rewrite_rule.is_instead,
    'definition', pg_catalog.pg_get_ruledef(rewrite_rule.oid, true)
  ) ORDER BY namespace.nspname, relation.relname, rewrite_rule.rulename), '[]'::jsonb) AS value
  FROM pg_catalog.pg_rewrite rewrite_rule
  JOIN pg_catalog.pg_class relation ON relation.oid = rewrite_rule.ev_class
  JOIN structural_namespaces namespace ON namespace.oid = relation.relnamespace
),
aggregate_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'name', procedure.proname,
    'identity_arguments', pg_catalog.pg_get_function_identity_arguments(procedure.oid),
    'owner', owner.rolname,
    'kind', aggregate_object.aggkind::text,
    'direct_arguments', aggregate_object.aggnumdirectargs,
    'transition_function', CASE WHEN aggregate_object.aggtransfn = 0 THEN NULL ELSE (
      SELECT jsonb_build_object('schema', function_namespace.nspname, 'name', function_object.proname,
        'identity_arguments', pg_catalog.pg_get_function_identity_arguments(function_object.oid))
      FROM pg_catalog.pg_proc function_object
      JOIN pg_catalog.pg_namespace function_namespace ON function_namespace.oid = function_object.pronamespace
      WHERE function_object.oid = aggregate_object.aggtransfn
    ) END,
    'final_function', CASE WHEN aggregate_object.aggfinalfn = 0 THEN NULL ELSE (
      SELECT jsonb_build_object('schema', function_namespace.nspname, 'name', function_object.proname,
        'identity_arguments', pg_catalog.pg_get_function_identity_arguments(function_object.oid))
      FROM pg_catalog.pg_proc function_object
      JOIN pg_catalog.pg_namespace function_namespace ON function_namespace.oid = function_object.pronamespace
      WHERE function_object.oid = aggregate_object.aggfinalfn
    ) END,
    'combine_function', CASE WHEN aggregate_object.aggcombinefn = 0 THEN NULL ELSE (
      SELECT jsonb_build_object('schema', function_namespace.nspname, 'name', function_object.proname,
        'identity_arguments', pg_catalog.pg_get_function_identity_arguments(function_object.oid))
      FROM pg_catalog.pg_proc function_object
      JOIN pg_catalog.pg_namespace function_namespace ON function_namespace.oid = function_object.pronamespace
      WHERE function_object.oid = aggregate_object.aggcombinefn
    ) END,
    'serial_function', CASE WHEN aggregate_object.aggserialfn = 0 THEN NULL ELSE (
      SELECT jsonb_build_object('schema', function_namespace.nspname, 'name', function_object.proname,
        'identity_arguments', pg_catalog.pg_get_function_identity_arguments(function_object.oid))
      FROM pg_catalog.pg_proc function_object
      JOIN pg_catalog.pg_namespace function_namespace ON function_namespace.oid = function_object.pronamespace
      WHERE function_object.oid = aggregate_object.aggserialfn
    ) END,
    'deserial_function', CASE WHEN aggregate_object.aggdeserialfn = 0 THEN NULL ELSE (
      SELECT jsonb_build_object('schema', function_namespace.nspname, 'name', function_object.proname,
        'identity_arguments', pg_catalog.pg_get_function_identity_arguments(function_object.oid))
      FROM pg_catalog.pg_proc function_object
      JOIN pg_catalog.pg_namespace function_namespace ON function_namespace.oid = function_object.pronamespace
      WHERE function_object.oid = aggregate_object.aggdeserialfn
    ) END,
    'moving_transition_function', CASE WHEN aggregate_object.aggmtransfn = 0 THEN NULL ELSE (
      SELECT jsonb_build_object('schema', function_namespace.nspname, 'name', function_object.proname,
        'identity_arguments', pg_catalog.pg_get_function_identity_arguments(function_object.oid))
      FROM pg_catalog.pg_proc function_object
      JOIN pg_catalog.pg_namespace function_namespace ON function_namespace.oid = function_object.pronamespace
      WHERE function_object.oid = aggregate_object.aggmtransfn
    ) END,
    'moving_inverse_function', CASE WHEN aggregate_object.aggminvtransfn = 0 THEN NULL ELSE (
      SELECT jsonb_build_object('schema', function_namespace.nspname, 'name', function_object.proname,
        'identity_arguments', pg_catalog.pg_get_function_identity_arguments(function_object.oid))
      FROM pg_catalog.pg_proc function_object
      JOIN pg_catalog.pg_namespace function_namespace ON function_namespace.oid = function_object.pronamespace
      WHERE function_object.oid = aggregate_object.aggminvtransfn
    ) END,
    'moving_final_function', CASE WHEN aggregate_object.aggmfinalfn = 0 THEN NULL ELSE (
      SELECT jsonb_build_object('schema', function_namespace.nspname, 'name', function_object.proname,
        'identity_arguments', pg_catalog.pg_get_function_identity_arguments(function_object.oid))
      FROM pg_catalog.pg_proc function_object
      JOIN pg_catalog.pg_namespace function_namespace ON function_namespace.oid = function_object.pronamespace
      WHERE function_object.oid = aggregate_object.aggmfinalfn
    ) END,
    'transition_type', (
      SELECT jsonb_build_object('schema', type_namespace.nspname, 'name', type_object.typname)
      FROM pg_catalog.pg_type type_object
      JOIN pg_catalog.pg_namespace type_namespace ON type_namespace.oid = type_object.typnamespace
      WHERE type_object.oid = aggregate_object.aggtranstype
    ),
    'moving_transition_type', CASE WHEN aggregate_object.aggmtranstype = 0 THEN NULL ELSE (
      SELECT jsonb_build_object('schema', type_namespace.nspname, 'name', type_object.typname)
      FROM pg_catalog.pg_type type_object
      JOIN pg_catalog.pg_namespace type_namespace ON type_namespace.oid = type_object.typnamespace
      WHERE type_object.oid = aggregate_object.aggmtranstype
    ) END,
    'transition_space', aggregate_object.aggtransspace,
    'moving_transition_space', aggregate_object.aggmtransspace,
    'final_extra', aggregate_object.aggfinalextra,
    'moving_final_extra', aggregate_object.aggmfinalextra,
    'final_modify', aggregate_object.aggfinalmodify::text,
    'moving_final_modify', aggregate_object.aggmfinalmodify::text,
    'sort_operator', CASE WHEN aggregate_object.aggsortop = 0 THEN NULL ELSE (
      SELECT jsonb_build_object(
        'schema', operator_namespace.nspname,
        'name', operator_object.oprname,
        'left_type', CASE WHEN operator_object.oprleft = 0 THEN NULL ELSE
          jsonb_build_object('schema', left_namespace.nspname, 'name', left_type.typname) END,
        'right_type', CASE WHEN operator_object.oprright = 0 THEN NULL ELSE
          jsonb_build_object('schema', right_namespace.nspname, 'name', right_type.typname) END
      )
      FROM pg_catalog.pg_operator operator_object
      JOIN pg_catalog.pg_namespace operator_namespace ON operator_namespace.oid = operator_object.oprnamespace
      LEFT JOIN pg_catalog.pg_type left_type ON left_type.oid = operator_object.oprleft
      LEFT JOIN pg_catalog.pg_namespace left_namespace ON left_namespace.oid = left_type.typnamespace
      LEFT JOIN pg_catalog.pg_type right_type ON right_type.oid = operator_object.oprright
      LEFT JOIN pg_catalog.pg_namespace right_namespace ON right_namespace.oid = right_type.typnamespace
      WHERE operator_object.oid = aggregate_object.aggsortop
    ) END,
    'initial_value', aggregate_object.agginitval,
    'moving_initial_value', aggregate_object.aggminitval
  ) ORDER BY namespace.nspname, procedure.proname,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)), '[]'::jsonb) AS value
  FROM pg_catalog.pg_aggregate aggregate_object
  JOIN pg_catalog.pg_proc procedure ON procedure.oid = aggregate_object.aggfnoid
  JOIN structural_namespaces namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = procedure.proowner
),
policy_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schema', namespace.nspname,
    'relation', relation.relname,
    'name', policy.polname,
    'permissive', policy.polpermissive,
    'command', policy.polcmd::text,
    'roles', COALESCE((
      SELECT jsonb_agg(
        CASE WHEN role_oid.oid = 0 THEN 'PUBLIC' ELSE role.rolname END
        ORDER BY CASE WHEN role_oid.oid = 0 THEN 'PUBLIC' ELSE role.rolname END
      )
      FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
      LEFT JOIN pg_catalog.pg_roles role ON role.oid = role_oid.oid
    ), '[]'::jsonb),
    'using', pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, true),
    'with_check', pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, true)
  ) ORDER BY namespace.nspname, relation.relname, policy.polname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_policy policy
  JOIN pg_catalog.pg_class relation ON relation.oid = policy.polrelid
  JOIN structural_namespaces namespace ON namespace.oid = relation.relnamespace
),
default_acl_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'role', role.rolname,
    'schema', namespace.nspname,
    'object_type', default_acl.defaclobjtype::text,
    'acl', COALESCE((
      SELECT jsonb_agg(item::text ORDER BY item::text)
      FROM pg_catalog.unnest(default_acl.defaclacl) item
    ), '[]'::jsonb)
  ) ORDER BY role.rolname, namespace.nspname, default_acl.defaclobjtype), '[]'::jsonb) AS value
  FROM pg_catalog.pg_default_acl default_acl
  JOIN pg_catalog.pg_roles role ON role.oid = default_acl.defaclrole
  LEFT JOIN structural_namespaces namespace ON namespace.oid = default_acl.defaclnamespace
  WHERE default_acl.defaclnamespace = 0 OR namespace.oid IS NOT NULL
),
parameter_acl_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'parameter', parameter_acl.parname,
    'grantor', COALESCE(grantor.rolname, 'PUBLIC'),
    'grantee', CASE WHEN exploded.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
    'privilege', exploded.privilege_type,
    'grantable', exploded.is_grantable
  ) ORDER BY parameter_acl.parname, COALESCE(grantor.rolname, 'PUBLIC'),
    CASE WHEN exploded.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
    exploded.privilege_type, exploded.is_grantable), '[]'::jsonb) AS value
  FROM pg_catalog.pg_parameter_acl parameter_acl
  CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) exploded
  LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = exploded.grantor
  LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = exploded.grantee
),
comment_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'object_type', identified.type,
    'schema', identified.schema,
    'name', identified.name,
    'identity', identified.identity,
    'subobject_id', description.objsubid,
    'comment', description.description
  ) ORDER BY identified.type, identified.schema, identified.identity, description.objsubid), '[]'::jsonb) AS value
  FROM pg_catalog.pg_description description
  CROSS JOIN LATERAL pg_identify_object(
    description.classoid, description.objoid, description.objsubid
  ) identified
  WHERE identified.schema IN (SELECT nspname FROM structural_namespaces)
     OR (identified.type = 'schema' AND identified.identity IN (SELECT nspname FROM structural_namespaces))
     OR (description.classoid IN (SELECT classoid FROM schema_less_comment_classes)
       AND (description.classoid <> 'pg_catalog.pg_event_trigger'::regclass
         OR identified.identity <> 'q12_guard_ddl_command_start'))
),
security_label_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'object_type', identified.type,
    'schema', identified.schema,
    'name', identified.name,
    'identity', identified.identity,
    'subobject_id', security_label.objsubid,
    'provider', security_label.provider,
    'label', security_label.label
  ) ORDER BY identified.type, identified.schema, identified.identity, security_label.objsubid, security_label.provider), '[]'::jsonb) AS value
  FROM pg_catalog.pg_seclabel security_label
  CROSS JOIN LATERAL pg_identify_object(
    security_label.classoid, security_label.objoid, security_label.objsubid
  ) identified
  WHERE identified.schema IN (SELECT nspname FROM structural_namespaces)
     OR (identified.type = 'schema' AND identified.identity IN (SELECT nspname FROM structural_namespaces))
     OR (security_label.classoid IN (SELECT classoid FROM schema_less_security_label_classes)
       AND (security_label.classoid <> 'pg_catalog.pg_event_trigger'::regclass
         OR identified.identity <> 'q12_guard_ddl_command_start'))
),
migration_rows AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'version', migration.version,
    'name', migration.name,
    'statements', to_jsonb(migration.statements)
  ) ORDER BY migration.version), '[]'::jsonb) AS value
  FROM supabase_migrations.schema_migrations migration
),
payload_row AS (
  SELECT jsonb_build_object(
    'schema_version', 'megacampus.q12.structural-catalog-payload/v1',
    'database', database_row.value,
    'schemas', schema_rows.value,
    'relations', relation_rows.value,
    'columns', column_rows.value,
    'sequences', sequence_rows.value,
    'extensions', extension_rows.value,
    'types', type_rows.value,
    'access_methods', access_method_rows.value,
    'casts', cast_rows.value,
    'collations', collation_rows.value,
    'conversions', conversion_rows.value,
    'foreign_data_wrappers', foreign_data_wrapper_rows.value,
    'foreign_servers', foreign_server_rows.value,
    'foreign_tables', foreign_table_rows.value,
    'user_mappings', user_mapping_rows.value,
    'indexes', index_rows.value,
    'constraints', constraint_rows.value,
    'functions', function_rows.value,
    'languages', language_rows.value,
    'operators', operator_rows.value,
    'operator_families', operator_family_rows.value,
    'operator_classes', operator_class_rows.value,
    'triggers', trigger_rows.value,
    'event_triggers', event_trigger_rows.value,
    'rules', rule_rows.value,
    'aggregates', aggregate_rows.value,
    'policies', policy_rows.value,
    'extended_statistics', extended_statistics_rows.value,
    'text_search_parsers', text_search_parser_rows.value,
    'text_search_templates', text_search_template_rows.value,
    'text_search_dictionaries', text_search_dictionary_rows.value,
    'text_search_configurations', text_search_configuration_rows.value,
    'transforms', transform_rows.value,
    'publications', publication_rows.value,
    'subscriptions', subscription_rows.value,
    'default_acls', default_acl_rows.value,
    'parameter_acls', parameter_acl_rows.value,
    'comments', comment_rows.value,
    'security_labels', security_label_rows.value,
    'migration_history', migration_rows.value
  ) AS payload
  FROM database_row, schema_rows, relation_rows, column_rows, sequence_rows, extension_rows, type_rows,
    access_method_rows, cast_rows, collation_rows, conversion_rows, foreign_data_wrapper_rows,
    foreign_server_rows, foreign_table_rows, user_mapping_rows, index_rows, constraint_rows,
    function_rows, language_rows, operator_rows, operator_family_rows, operator_class_rows,
    trigger_rows, event_trigger_rows, rule_rows, aggregate_rows, policy_rows,
    extended_statistics_rows, text_search_parser_rows, text_search_template_rows,
    text_search_dictionary_rows, text_search_configuration_rows, transform_rows,
    publication_rows, subscription_rows, default_acl_rows, parameter_acl_rows, comment_rows,
    security_label_rows, migration_rows
)
SELECT payload,
  encode(extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256'), 'hex') AS structural_sha256
FROM payload_row
