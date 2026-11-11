package gymtrack

import graphql.ExecutionInput
import graphql.GraphQL
import graphql.GraphqlErrorBuilder
import graphql.analysis.MaxQueryComplexityInstrumentation
import graphql.analysis.MaxQueryDepthInstrumentation
import graphql.execution.DataFetcherExceptionHandler
import graphql.execution.DataFetcherExceptionHandlerResult
import graphql.execution.instrumentation.ChainedInstrumentation
import graphql.schema.DataFetchingEnvironment
import graphql.schema.idl.RuntimeWiring
import graphql.schema.idl.SchemaGenerator
import graphql.schema.idl.SchemaParser
import org.slf4j.LoggerFactory
import java.util.concurrent.CompletableFuture

class GraphqlApi(repository: WorkoutRepository) {
    private val logger = LoggerFactory.getLogger(GraphqlApi::class.java)
    private val exceptionHandler = DataFetcherExceptionHandler { parameters ->
        val cause = parameters.exception
        if (cause !is UserError) logger.error("GraphQL execution failed", cause)
        val error = GraphqlErrorBuilder.newError()
            .path(parameters.path).location(parameters.sourceLocation)
            .message(if (cause is UserError) cause.message!! else "An internal error occurred.")
            .extensions(mapOf("code" to if (cause is UserError) cause.code else "INTERNAL_SERVER_ERROR"))
            .build()
        CompletableFuture.completedFuture(DataFetcherExceptionHandlerResult.newResult().error(error).build())
    }
    private val wiring = RuntimeWiring.newRuntimeWiring()
        .type("Query") { type ->
            type.dataFetcher("trainingPlans") { repository.plans() }
                .dataFetcher("trainingPlan") { env -> repository.plan(env.required("id")) }
                .dataFetcher("workout") { env -> repository.workout(env.required("id")) }
                .dataFetcher("workoutSession") { env -> repository.session(env.required("id")) }
                .dataFetcher("workoutSessions") { env ->
                    repository.sessions(env.getArgument("workoutId"), env.required("limit"), env.required("offset"))
                }
        }
        .type("Mutation") { type ->
            type.dataFetcher("startWorkout") { env -> repository.startWorkout(env.required("workoutId")) }
                .dataFetcher("recordFirstSet") { env ->
                    val input = env.required<Map<String, Any?>>("input")
                    repository.recordFirstSet(
                        input["sessionId"] as String, input["workoutId"] as String,
                        input["workoutExerciseId"] as String, input["id"] as String,
                        input["reps"] as Int, input["weightGrams"] as Int?, input["type"] as String?,
                    )
                }
                .dataFetcher("logSet") { env ->
                    val input = env.required<Map<String, Any?>>("input")
                    repository.logSet(
                        input["sessionExerciseId"] as String, input["reps"] as Int,
                        input["weightGrams"] as Int?, input["type"] as String?, input["id"] as String?,
                    )
                }
                .dataFetcher("updateSet") { env ->
                    val input = env.required<Map<String, Any?>>("input")
                    repository.updateSet(env.required("id"), input["reps"] as Int, input["weightGrams"] as Int?, input["type"] as String?)
                }
                .dataFetcher("updateWorkoutSession") { env -> repository.updateSession(env.required("id"), env.required("startedAt")) }
                .dataFetcher("deleteSet") { env -> repository.deleteSet(env.required("id")) }
                .dataFetcher("deleteWorkoutSession") { env -> repository.deleteSession(env.required("id")) }
                .dataFetcher("finishWorkoutSession") { env -> repository.finishSession(env.required("id")) }
        }.build()
    private val graphQL = GraphQL.newGraphQL(
        SchemaGenerator().makeExecutableSchema(
            SchemaParser().parse(checkNotNull(javaClass.getResource("/schema.graphqls")).readText()), wiring,
        ),
    ).defaultDataFetcherExceptionHandler(exceptionHandler)
        .instrumentation(ChainedInstrumentation(listOf(MaxQueryDepthInstrumentation(16), MaxQueryComplexityInstrumentation(1000))))
        .build()

    fun execute(query: String, variables: Map<String, Any?> = emptyMap(), operationName: String? = null): Map<String, Any?> =
        graphQL.execute(
            ExecutionInput.newExecutionInput().query(query).variables(variables).operationName(operationName).build(),
        ).toSpecification()

    private inline fun <reified T> DataFetchingEnvironment.required(name: String): T =
        checkNotNull(getArgument<T>(name)) { "Missing validated GraphQL argument: $name" }
}
